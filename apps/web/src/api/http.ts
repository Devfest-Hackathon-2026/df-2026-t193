import { z } from 'zod';
import { identifySchema } from '@tonari/shared';
import { GatewayError, type Gateway, type Session } from './gateway';
const sessionSchema = z.object({ token: z.string().min(1), expires_at: z.string().datetime() });
export function createHttpGateway(
  base: string,
  fetcher: typeof fetch = fetch,
  timeout = { normal: 10000, identify: 20000 },
): Gateway {
  async function request(
    path: string,
    signal: AbortSignal,
    init: RequestInit = {},
    milliseconds = timeout.normal,
  ): Promise<unknown> {
    if (!base) throw new GatewayError('unconfigured');
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort();
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    signal.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, milliseconds);
    try {
      const response = await fetcher(`${base.replace(/\/$/, '')}${path}`, {
        ...init,
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
      });
      if (!response.ok) {
        const kind =
          response.status === 401
            ? 'expired'
            : response.status === 413
              ? 'tooLarge'
              : response.status === 429
                ? 'limited'
                : 'server';
        const retry = response.headers.get('Retry-After');
        const time =
          retry && /^\d+$/.test(retry) ? Date.now() + Number(retry) * 1000 : retry ? Date.parse(retry) : 0;
        throw new GatewayError(kind, Number.isFinite(time) ? time : 0);
      }
      try {
        return await response.json();
      } catch {
        throw new GatewayError('protocol');
      }
    } catch (error) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (timedOut) throw new GatewayError('timeout');
      if (error instanceof GatewayError) throw error;
      throw new GatewayError('offline');
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
    }
  }
  const authorization = (session: Session) => {
    if (Date.parse(session.expiresAt) <= Date.now()) throw new GatewayError('expired');
    return { Authorization: `Bearer ${session.token}` };
  };
  return {
    async createSession(signal) {
      const parsed = sessionSchema.safeParse(
        await request('/session', signal, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }),
      );
      if (!parsed.success || Date.parse(parsed.data.expires_at) <= Date.now())
        throw new GatewayError('protocol');
      return { token: parsed.data.token, expiresAt: parsed.data.expires_at };
    },
    async identify(image, session, signal) {
      const form = new FormData();
      form.append('image', image, 'capture.jpg');
      const parsed = identifySchema.safeParse(
        await request(
          '/identify',
          signal,
          { method: 'POST', headers: authorization(session), body: form },
          timeout.identify,
        ),
      );
      if (!parsed.success) throw new GatewayError('protocol');
      return parsed.data;
    },
    getFlow(id, version, session, signal) {
      return request(`/flows/${encodeURIComponent(id)}?version=${encodeURIComponent(version)}`, signal, {
        headers: authorization(session),
      });
    },
  };
}
