// 식별 정확도 측정 도구 (빌드 가이드의 tools/eval-identify).
// 사진 파일 이름의 앞부분이 정답이다:
//   start*.jpg, department*.jpg, confirmation*.jpg, finished*.jpg → 그 screen_id로 ok 이어야 함
//   그 밖의 이름(personal-input, blank 등)                         → ok가 아니어야 함 (sensitive/unknown/unsupported)
// 사용: npm run eval:identify -w @tonari/api -- <사진 폴더> [반복 횟수]
// 사진·결과는 저장하지 않고 화면에만 출력한다.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../src/config';
import { loadReviewedFlows } from '../src/flows';
import { createGeminiIdentifier } from '../src/identifier';

const [dir, repeatArg] = process.argv.slice(2);
if (!dir) {
  console.error('usage: eval-identify <photo dir> [repeat]');
  process.exit(2);
}
const repeat = Number(repeatArg ?? 1);
const config = loadConfig({ ...process.env, IDENTIFIER: 'gemini' });
const flows = loadReviewedFlows(config.flowsDir);
const identify = createGeminiIdentifier(config, flows);
const screens = new Set([...flows.values()].flatMap((f) => f.screens.map((s) => s.screen_id)));

console.log(`model=${config.modelFlash} location=${config.gcpLocation} repeat=${repeat}`);
let pass = 0;
let total = 0;
for (const file of readdirSync(dir)
  .filter((f) => /\.jpe?g$/i.test(f))
  .sort()) {
  const expected = [...screens].find((s) => file.startsWith(s)) ?? null;
  const jpeg = new Uint8Array(readFileSync(join(dir, file)));
  for (let i = 0; i < repeat; i++) {
    const started = Date.now();
    const result = await identify(jpeg, AbortSignal.timeout(20_000));
    const ok = expected ? result.status === 'ok' && result.screen_id === expected : result.status !== 'ok';
    const got = result.status === 'ok' ? `ok:${result.screen_id}` : result.status;
    console.log(
      `${ok ? '✓' : '✗'} ${file.padEnd(24)} expected=${(expected ?? 'not ok').padEnd(13)} got=${got.padEnd(16)} ${Date.now() - started}ms`,
    );
    total++;
    if (ok) pass++;
  }
}
console.log(`\n${pass}/${total} passed`);
process.exit(pass === total ? 0 : 1);
