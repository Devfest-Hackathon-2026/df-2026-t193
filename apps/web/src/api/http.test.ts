import { describe, it, expect, vi } from 'vitest';
import { createHttpGateway } from './http';
const session = { token: 'test-only', expiresAt: new Date(Date.now() + 60000).toISOString() };
const signal = () => new AbortController().signal;
describe('HTTP boundary', () => {
  it('does not silently use samples without API configuration', async () => {
    await expect(createHttpGateway('').createSession(signal())).rejects.toMatchObject({
      kind: 'unconfigured',
    });
  });
  it.each([
    [401, 'expired'],
    [413, 'tooLarge'],
    [429, 'limited'],
    [500, 'server'],
  ] as const)('classifies HTTP %s', async (code, kind) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{}', { status: code, headers: { 'Retry-After': '30' } }));
    await expect(
      createHttpGateway('https://example.test', fetcher).createSession(signal()),
    ).rejects.toMatchObject({ kind });
  });
  it('rejects expired sessions before sending a photo', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      createHttpGateway('https://example.test', fetcher).identify(
        new Blob(),
        { ...session, expiresAt: '2000-01-01T00:00:00Z' },
        signal(),
      ),
    ).rejects.toMatchObject({ kind: 'expired' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('sends a JPEG with bearer auth without setting a broken multipart boundary', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"status":"unknown"}'));
    const g = createHttpGateway('https://example.test', fetcher);
    await g.identify(new Blob(['fixture'], { type: 'image/jpeg' }), session, signal());
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://example.test/identify');
    expect(init?.headers).toEqual({ Authorization: 'Bearer test-only' });
    expect((init?.body as FormData).get('image')).toMatchObject({ type: 'image/jpeg' });
  });
  it('rejects wrong JSON shape', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"status":"ok"}'));
    await expect(
      createHttpGateway('https://example.test', fetcher).identify(new Blob(), session, signal()),
    ).rejects.toMatchObject({ kind: 'protocol' });
  });
  it('does not send cancelled requests', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const c = new AbortController();
    c.abort();
    await expect(
      createHttpGateway('https://example.test', fetcher).createSession(c.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('aborts timed-out requests without retries', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        (_url, init) =>
          new Promise((_, reject) =>
            init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))),
          ),
      );
    await expect(
      createHttpGateway('https://example.test', fetcher, { normal: 5, identify: 5 }).createSession(signal()),
    ).rejects.toMatchObject({ kind: 'timeout' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects unreadable response body', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('not json'));
    await expect(
      createHttpGateway('https://example.test', fetcher).createSession(signal()),
    ).rejects.toMatchObject({ kind: 'protocol' });
  });
});
