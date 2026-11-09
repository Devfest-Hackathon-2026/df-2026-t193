import { describe, expect, it } from 'vitest';
import { identifySchema, validateIdentification } from '@tonari/shared';
import { createApp } from './app';
import { loadConfig } from './config';
import { loadReviewedFlows } from './flows';
import { candidatesOf, createFakeIdentifier, decide, withHedge, type Identifier } from './identifier';
import { MACHINE_MARKERS } from './screen-hints';

const ORIGIN = 'http://127.0.0.1:5173';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

function setup(env: Record<string, string> = {}, identify?: Identifier) {
  const config = loadConfig({ ALLOWED_ORIGINS: ORIGIN, ...env });
  const flows = loadReviewedFlows(config.flowsDir);
  const clock = { t: Date.parse('2026-11-08T03:00:00Z') };
  const logs: Record<string, unknown>[] = [];
  const app = createApp({
    config,
    flows,
    identify: identify ?? createFakeIdentifier(flows),
    now: () => clock.t,
    log: (e) => logs.push(e),
  });
  const session = async () => {
    const res = await app.request('/session', {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Type': 'application/json' },
    });
    return (await res.json()) as { token: string; expires_at: string };
  };
  const send = (token: string, body: Uint8Array<ArrayBuffer> | null = JPEG, field = 'image') => {
    const form = new FormData();
    if (body) form.append(field, new Blob([body], { type: 'image/jpeg' }), 'capture.jpg');
    return app.request('/identify', {
      method: 'POST',
      body: form,
      headers: { Authorization: `Bearer ${token}` },
    });
  };
  return { app, flows, clock, logs, session, send };
}

describe('POST /session', () => {
  it('returns a token and a future ISO8601 expires_at (30 min)', async () => {
    const { session, clock } = setup();
    const s = await session();
    expect(s.token.length).toBeGreaterThan(10);
    expect(s.expires_at).toBe(new Date(clock.t + 30 * 60_000).toISOString());
  });
});

describe('POST /identify', () => {
  it('ok result passes the frontend strict schema and flow validation', async () => {
    const { app, session, send } = setup();
    const { token } = await session();
    const res = await send(token);
    expect(res.status).toBe(200);
    const body = identifySchema.parse(await res.json());
    expect(body).toEqual({
      status: 'ok',
      flow_id: 'hospital-recheck',
      flow_version: '1',
      machine_id: 'mock-hospital-v1',
      screen_id: 'start',
      step_id: 's1',
    });
    if (body.status !== 'ok') throw new Error();
    const flowRes = await app.request(`/flows/${body.flow_id}?version=${body.flow_version}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(validateIdentification(body, await flowRes.json()).flow_id).toBe('hospital-recheck');
  });

  it('401 without token, with forged token, and after expiry', async () => {
    const { session, send, clock } = setup();
    expect((await send('')).status).toBe(401);
    expect((await send('abc.def.ghi')).status).toBe(401);
    const { token } = await session();
    clock.t += 31 * 60_000;
    expect((await send(token)).status).toBe(401);
  });

  it('413 when the image is larger than the limit', async () => {
    const { session, send } = setup({ MAX_IMAGE_BYTES: '1000' });
    const { token } = await session();
    const big = new Uint8Array(5000);
    big.set([0xff, 0xd8, 0xff]);
    expect((await send(token, big)).status).toBe(413);
  });

  it('400 when image is missing or not a JPEG', async () => {
    const { session, send } = setup();
    const { token } = await session();
    expect((await send(token, null)).status).toBe(400);
    expect((await send(token, JPEG, 'photo')).status).toBe(400);
    expect((await send(token, new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).status).toBe(400);
  });

  it('429 with Retry-After after the per-minute limit, then recovers', async () => {
    const { session, send, clock } = setup({ IDENTIFY_PER_MINUTE: '2' });
    const { token } = await session();
    expect((await send(token)).status).toBe(200);
    expect((await send(token)).status).toBe(200);
    const limited = await send(token);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
    clock.t += 61_000;
    expect((await send(token)).status).toBe(200);
  });

  it('502 when the model call fails, and never leaks details', async () => {
    const { session, send } = setup({}, async () => {
      throw new Error('quota secret detail');
    });
    const { token } = await session();
    const res = await send(token);
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain('secret');
  });

  it('turns a model result that does not match a registered flow into unknown', async () => {
    const { session, send } = setup({}, async () => ({
      status: 'ok',
      flow_id: 'hospital-recheck',
      flow_version: '1',
      machine_id: 'mock-hospital-v1',
      screen_id: 'start',
      step_id: 's4', // 등록된 first_step(s1)과 다름
    }));
    const { token } = await session();
    expect(await (await send(token)).json()).toEqual({ status: 'unknown' });
  });
});

describe('decide (model answer → safe result)', () => {
  const { flows } = setup();
  const candidates = candidatesOf(flows);
  it('maps a confident registered label to ok', () => {
    expect(decide({ label: 'hospital-recheck:department', confidence: 0.9 }, candidates, 0.7)).toMatchObject({
      status: 'ok',
      screen_id: 'department',
      step_id: 's2',
    });
  });
  it('low confidence → unknown', () => {
    expect(decide({ label: 'hospital-recheck:start', confidence: 0.5 }, candidates, 0.7)).toEqual({
      status: 'unknown',
    });
  });
  it('sensitive wins even with low confidence', () => {
    expect(decide({ label: 'sensitive', confidence: 0.2 }, candidates, 0.7)).toEqual({ status: 'sensitive' });
  });
  it('unsupported only when confident', () => {
    expect(decide({ label: 'unsupported', confidence: 0.9 }, candidates, 0.7)).toEqual({
      status: 'unsupported',
    });
    expect(decide({ label: 'unsupported', confidence: 0.3 }, candidates, 0.7)).toEqual({ status: 'unknown' });
  });
  it('made-up labels and garbage → unknown', () => {
    expect(decide({ label: 'hospital-recheck:s4', confidence: 1 }, candidates, 0.7)).toEqual({
      status: 'unknown',
    });
    expect(decide({}, candidates, 0.7)).toEqual({ status: 'unknown' });
  });
});

describe('GET /flows/:id', () => {
  it('returns the reviewed flow object itself, 404 for wrong version or unknown id', async () => {
    const { app, session } = setup();
    const { token } = await session();
    const auth = { headers: { Authorization: `Bearer ${token}` } };
    const ok = await app.request('/flows/hospital-recheck?version=1', auth);
    expect(ok.status).toBe(200);
    expect((await ok.json()).schema_version).toBe(1);
    expect((await app.request('/flows/hospital-recheck?version=2', auth)).status).toBe(404);
    expect((await app.request('/flows/nope?version=1', auth)).status).toBe(404);
    expect((await app.request('/flows/hospital-recheck?version=1')).status).toBe(401);
  });
});

describe('CORS, emergency stop, logging', () => {
  it('allows the web origin and exposes Retry-After', async () => {
    const { app } = setup();
    const pre = await app.request('/identify', {
      method: 'OPTIONS',
      headers: {
        Origin: ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization',
      },
    });
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(pre.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain('authorization');
    const res = await app.request('/session', { method: 'POST', headers: { Origin: ORIGIN } });
    expect(res.headers.get('Access-Control-Expose-Headers')).toContain('Retry-After');
  });

  it('does not allow other origins', async () => {
    const { app } = setup();
    const res = await app.request('/session', {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('emergency stop returns 503', async () => {
    const { app } = setup({ EMERGENCY_STOP: 'true' });
    expect((await app.request('/session', { method: 'POST' })).status).toBe(503);
  });

  it('logs only method/path/status/ms — no token or query', async () => {
    const { app, session, send, logs } = setup();
    const { token } = await session();
    await send(token);
    await app.request('/flows/hospital-recheck?version=1', { headers: { Authorization: `Bearer ${token}` } });
    const text = JSON.stringify(logs);
    expect(text).not.toContain(token);
    expect(text).not.toContain('version=');
    expect(Object.keys(logs[0] ?? {}).sort()).toEqual(['method', 'ms', 'path', 'status']);
  });
});

describe('config', () => {
  it('refuses to start in production without secret or explicit identifier', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow('JWT_SECRET');
    expect(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x' })).toThrow('IDENTIFIER');
  });
});

describe('screen hints', () => {
  it('every reviewed screen has a visual hint for the model', async () => {
    const { SCREEN_HINTS } = await import('./screen-hints');
    const { flows } = setup();
    for (const c of candidatesOf(flows)) expect(SCREEN_HINTS[c.key], c.key).toBeTruthy();
  });
});

describe('machine markers', () => {
  it('every reviewed machine has a marker the photo must show', () => {
    for (const { flow } of candidatesOf(loadReviewedFlows(loadConfig({}).flowsDir)))
      expect(MACHINE_MARKERS[flow.machine_id], flow.machine_id).toBeTruthy();
  });
});

describe('withHedge', () => {
  const never = (signal: AbortSignal) =>
    new Promise<string>((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason));
    });
  const httpError = (status: number) => Object.assign(new Error('api'), { status });
  const open = () => new AbortController().signal;

  it('sends a second request when the first is slow, and the winner cancels the loser', async () => {
    const signals: AbortSignal[] = [];
    const result = await withHedge(
      open(),
      (signal) => {
        signals.push(signal);
        return signals.length === 1 ? never(signal) : Promise.resolve('ok');
      },
      10,
    );
    expect([result, signals.length, signals[0]!.aborted]).toEqual(['ok', 2, true]);
  });
  it('does not send a second request when the first answers in time', async () => {
    let calls = 0;
    const result = await withHedge(
      open(),
      () => {
        calls++;
        return Promise.resolve('ok');
      },
      10,
    );
    await new Promise((done) => setTimeout(done, 30));
    expect([result, calls]).toEqual(['ok', 1]);
  });
  it('sends the second request at once after a server error', async () => {
    let calls = 0;
    const result = await withHedge(
      open(),
      () => (++calls === 1 ? Promise.reject(httpError(503)) : Promise.resolve('ok')),
      100_000,
    );
    expect([result, calls]).toEqual(['ok', 2]);
  });
  it('gives up after both requests fail', async () => {
    let calls = 0;
    await expect(
      withHedge(open(), () => {
        calls++;
        return Promise.reject(httpError(500));
      }),
    ).rejects.toThrow('api');
    expect(calls).toBe(2);
  });
  it('does not send a second request after a request error', async () => {
    let calls = 0;
    await expect(
      withHedge(open(), () => {
        calls++;
        return Promise.reject(httpError(400));
      }),
    ).rejects.toThrow('api');
    expect(calls).toBe(1);
  });
  it('stops when the caller cancels', async () => {
    const controller = new AbortController();
    let calls = 0;
    const pending = withHedge(controller.signal, (signal) => {
      calls++;
      return never(signal);
    });
    controller.abort();
    await expect(pending).rejects.toBeDefined();
    await new Promise((done) => setTimeout(done, 20));
    expect(calls).toBe(1);
  });
});
