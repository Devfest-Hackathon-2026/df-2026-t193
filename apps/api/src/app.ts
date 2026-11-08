// API 본체. 규격: docs/backend-handoff.md, specs/001-frontend-foundation/contracts.md
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { SignJWT, jwtVerify } from 'jose';
import { identifySchema, type Flow } from '@tonari/shared';
import type { Config } from './config';
import type { Identifier } from './identifier';

export interface Deps {
  config: Config;
  flows: Map<string, Flow>;
  identify: Identifier;
  now?: () => number;
  log?: (entry: Record<string, unknown>) => void;
}

const IDENTIFY_TIMEOUT_MS = 18_000; // 프론트는 20초에 포기하므로 그보다 조금 짧게
const MULTIPART_OVERHEAD = 64 * 1024;

export function createApp({ config, flows, identify, now = Date.now, log = defaultLog }: Deps) {
  const app = new Hono();

  // 1) 요청 기록: 경로·상태·걸린 시간만. 사진, 토큰, 응답 내용은 남기지 않는다.
  app.use('*', async (c, next) => {
    const start = now();
    await next();
    log({ method: c.req.method, path: new URL(c.req.url).pathname, status: c.res.status, ms: now() - start });
  });

  // 2) CORS: 허용한 웹 주소에서만 브라우저 호출 허용. 429의 Retry-After를 프론트가 읽을 수 있게 노출.
  app.use(
    '*',
    cors({
      origin: (origin) => (config.allowedOrigins.includes(origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type'],
      exposeHeaders: ['Retry-After'],
      maxAge: 600,
    }),
  );

  // 3) 긴급 정지 스위치
  app.use('*', async (c, next) => {
    if (config.emergencyStop) return c.json({ error: 'stopped' }, 503);
    await next();
  });

  // 토큰 검사: 없거나, 위조됐거나, 만료됐으면 false
  const authorized = async (c: Context) => {
    const header = c.req.header('Authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return false;
    try {
      await jwtVerify(token, config.jwtSecret, {
        algorithms: ['HS256'],
        typ: 'session',
        currentDate: new Date(now()),
      });
      return true;
    } catch {
      return false;
    }
  };

  // POST /session → { token, expires_at: ISO8601 }
  app.post('/session', async (c) => {
    const issuedAt = Math.floor(now() / 1000);
    const expiresAt = issuedAt + config.sessionMinutes * 60;
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'session' })
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAt)
      .sign(config.jwtSecret);
    return c.json({ token, expires_at: new Date(expiresAt * 1000).toISOString() });
  });

  // 비용 보호: 1분 단위 창 + 총량. 서버 메모리에만 있어서 다시 켜면 초기화된다.
  let windowStart = 0;
  let windowCount = 0;
  let total = 0;
  const takeIdentifySlot = (): number | null => {
    const t = now();
    if (total >= config.identifyTotalCap) return 3600;
    if (t - windowStart >= 60_000) {
      windowStart = t;
      windowCount = 0;
    }
    if (windowCount >= config.identifyPerMinute)
      return Math.max(1, Math.ceil((windowStart + 60_000 - t) / 1000));
    windowCount++;
    total++;
    return null;
  };

  // POST /identify  (Authorization + multipart의 image 필드 하나)
  app.post(
    '/identify',
    async (c, next) => ((await authorized(c)) ? next() : c.json({ error: 'unauthorized' }, 401)),
    bodyLimit({
      maxSize: config.maxImageBytes + MULTIPART_OVERHEAD,
      onError: (c) => c.json({ error: 'too_large' }, 413),
    }),
    async (c) => {
      const retryAfter = takeIdentifySlot();
      if (retryAfter !== null) {
        c.header('Retry-After', String(retryAfter));
        return c.json({ error: 'limited' }, 429);
      }

      let image: unknown;
      try {
        image = (await c.req.parseBody())['image'];
      } catch {
        return c.json({ error: 'bad_request' }, 400);
      }
      if (!(image instanceof File)) return c.json({ error: 'bad_request' }, 400);
      if (image.size > config.maxImageBytes) return c.json({ error: 'too_large' }, 413);

      const bytes = new Uint8Array(await image.arrayBuffer());
      // JPEG 파일은 항상 FF D8 FF로 시작한다
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff)
        return c.json({ error: 'bad_request' }, 400);

      let result;
      try {
        result = await identify(bytes, AbortSignal.timeout(IDENTIFY_TIMEOUT_MS));
      } catch (error) {
        log({ event: 'identify_failed', kind: error instanceof Error ? error.name : 'unknown' });
        return c.json({ error: 'server' }, 502);
      } finally {
        bytes.fill(0); // 사진 데이터는 더 쓰지 않는다 (저장·로그 없음)
      }

      // 나가기 전에 프론트와 같은 strict 스키마로 한 번 더 검사
      const checked = identifySchema.safeParse(result);
      if (!checked.success) return c.json({ status: 'unknown' });
      const data = checked.data;
      if (data.status === 'ok') {
        const flow = flows.get(data.flow_id);
        const screen = flow?.screens.find((s) => s.screen_id === data.screen_id);
        if (
          !flow ||
          flow.version !== data.flow_version ||
          flow.machine_id !== data.machine_id ||
          screen?.first_step !== data.step_id
        )
          return c.json({ status: 'unknown' });
      }
      return c.json(checked.data);
    },
  );

  // GET /flows/:id?version=1 → 검수된 Flow 객체 그대로
  app.get('/flows/:id', async (c) => {
    if (!(await authorized(c))) return c.json({ error: 'unauthorized' }, 401);
    const flow = flows.get(c.req.param('id'));
    const version = c.req.query('version');
    if (!flow || (version !== undefined && version !== flow.version))
      return c.json({ error: 'not_found' }, 404);
    return c.json(flow);
  });

  app.get('/healthz', (c) => c.json({ ok: true }));
  app.notFound((c) => c.json({ error: 'not_found' }, 404));
  app.onError((error, c) => {
    log({ event: 'error', kind: error.name });
    return c.json({ error: 'server' }, 500);
  });

  return app;
}

function defaultLog(entry: Record<string, unknown>) {
  console.log(JSON.stringify(entry));
}
