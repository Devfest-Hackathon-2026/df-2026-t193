/**
 * Backend contract check: runs the frontend's own HTTP adapter and validators against a live API.
 * Uses synthetic mock-kiosk screenshots (e2e/fixtures/kiosk); prints only status, never tokens.
 *
 *   npm run api:check -- https://<api-base> [--origin https://axial-sunup-488315-k1.web.app]
 *
 * PASS here means the server speaks the contract the app expects. It does not prove model
 * accuracy, photo deletion or rate limits — those need server-side evidence.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateIdentification } from '@tonari/shared';
import { createHttpGateway } from '../src/api/http';
import { GatewayError } from '../src/api/gateway';
import { assertSupportedScenes } from '../src/content/hospital-scenes';

const args = process.argv.slice(2);
const base = args.find((a) => /^https?:\/\//.test(a) && args[args.indexOf(a) - 1] !== '--origin');
const originIndex = args.indexOf('--origin');
const origin = originIndex >= 0 ? args[originIndex + 1] : 'https://axial-sunup-488315-k1.web.app';
if (!base) throw new Error('Usage: npm run api:check -- <api-base> [--origin <web-origin>]');
const root = base.replace(/\/$/, '');
const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), '../e2e/fixtures/kiosk');
const image = (name: string) =>
  new Blob([readFileSync(resolve(fixtures, `${name}.jpg`))], { type: 'image/jpeg' });
const gateway = createHttpGateway(root, fetch, { normal: 10000, identify: 20000 });
const signal = () => new AbortController().signal;

let failed = 0;
const results: string[] = [];
async function check(name: string, run: () => Promise<string | void>) {
  try {
    const note = await run();
    results.push(`PASS  ${name}${note ? `  (${note})` : ''}`);
  } catch (error) {
    failed++;
    const reason = error instanceof GatewayError ? `GatewayError ${error.kind}` : String(error);
    results.push(`FAIL  ${name}  — ${reason.slice(0, 200)}`);
  }
}
const expect = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

await check(`CORS preflight from ${origin}`, async () => {
  const response = await fetch(`${root}/identify`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin!,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization',
    },
  });
  const allow = response.headers.get('access-control-allow-origin');
  const headers = (response.headers.get('access-control-allow-headers') ?? '').toLowerCase();
  expect(response.ok, `preflight HTTP ${response.status}`);
  expect(allow === origin || allow === '*', `allow-origin is ${allow}`);
  expect(headers.includes('authorization') || headers === '*', `allow-headers is "${headers}"`);
});

const session = await gateway.createSession(signal()).catch((error) => {
  results.push(`FAIL  POST /session  — ${error instanceof GatewayError ? error.kind : error}`);
  failed++;
  return null;
});
if (session) results.push(`PASS  POST /session  (expires ${session.expiresAt})`);

await check('POST /session exposes Retry-After to the browser', async () => {
  const response = await fetch(`${root}/session`, {
    method: 'POST',
    headers: { Origin: origin!, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const exposed = (response.headers.get('access-control-expose-headers') ?? '').toLowerCase();
  expect(exposed.includes('retry-after') || exposed === '*', `expose-headers is "${exposed}"`);
});

await check('POST /identify without token is 401', async () => {
  const form = new FormData();
  form.append('image', image('start'), 'capture.jpg');
  const response = await fetch(`${root}/identify`, { method: 'POST', body: form, redirect: 'error' });
  expect(response.status === 401, `HTTP ${response.status}`);
});

const registered: [string, string, string][] = [
  ['start', 'start', 's1'],
  ['department', 'department', 's2'],
  ['confirmation', 'confirmation', 's5'],
  ['finished', 'finished', 's6'],
];
for (const [fixture, screen, step] of registered)
  await check(`identify ${fixture} → ok ${screen}/${step}, flow validates`, async () => {
    expect(session, 'no session');
    const started = Date.now();
    const result = await gateway.identify(image(fixture), session!, signal());
    const took = `${((Date.now() - started) / 1000).toFixed(1)}s`;
    expect(result.status === 'ok', `status ${result.status} after ${took}`);
    if (result.status !== 'ok') return;
    expect(result.screen_id === screen && result.step_id === step, `${result.screen_id}/${result.step_id}`);
    const flow = validateIdentification(
      result,
      await gateway.getFlow(result.flow_id, result.flow_version, session!, signal()),
    );
    assertSupportedScenes(flow);
    return took;
  });

for (const fixture of ['personal-input', 'blank'])
  await check(`identify ${fixture} → never ok`, async () => {
    expect(session, 'no session');
    const result = await gateway.identify(image(fixture), session!, signal());
    expect(result.status !== 'ok', `returned ok ${'screen_id' in result ? result.screen_id : ''}`);
    return result.status;
  });

await check('GET /flows with unknown version is rejected', async () => {
  expect(session, 'no session');
  const outcome = await gateway
    .getFlow('hospital-recheck', '999', session!, signal())
    .then(() => 'returned a flow')
    .catch((error) => (error instanceof GatewayError ? error.kind : String(error)));
  expect(outcome !== 'returned a flow', 'server answered a flow for version 999');
  return outcome;
});

console.log(results.join('\n'));
console.log(failed ? `\n${failed} check(s) failed` : '\nAll contract checks passed');
process.exitCode = failed ? 1 : 0;
