/**
 * Repeats the identify stress measurement from specs/002-stability-hardening.
 * Sends synthetic images only: mock-kiosk screens with simulated photo damage, and invented
 * screens of other machines. Writes no files and prints only labels and timings.
 *
 *   npm run api:stress -- https://<api-base>
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const api = process.argv
  .slice(2)
  .find((a) => a.startsWith('http'))
  ?.replace(/\/$/, '');
if (!api) throw new Error('Usage: npm run api:stress -- <api-base>');
const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), '../e2e/fixtures/kiosk');
const MIN_GAP_MS = 2300; // Stays under the server's 30 identify requests per minute.

interface Damage {
  box: string;
  img: string;
  extra: string;
}
type Html = (img: string) => string;
const desk = 'background:linear-gradient(135deg,#6d6256,#3f3a35);';
const damage: Record<string, Damage> = {
  clean: { box: '', img: 'width:100%;height:100%;object-fit:contain', extra: '' },
  rotated: { box: desk, img: 'width:82%;margin:8% 9%;transform:rotate(-7deg)', extra: '' },
  perspective: {
    box: desk,
    img: 'width:78%;margin:9% 11%;transform:perspective(900px) rotateX(14deg) rotateY(-12deg)',
    extra: '',
  },
  dark: { box: desk, img: 'width:88%;margin:6%;filter:brightness(.55)', extra: '' },
  blurred: { box: desk, img: 'width:88%;margin:6%;filter:blur(2.2px)', extra: '' },
  glare: {
    box: desk,
    img: 'width:88%;margin:6%',
    extra:
      '<div style="position:absolute;inset:0;background:radial-gradient(circle at 70% 28%,rgba(255,255,255,.8),rgba(255,255,255,0) 42%)"></div>',
  },
  far: { box: desk, img: 'width:46%;margin:26% 27%;transform:rotate(3deg)', extra: '' },
  moire: {
    box: desk,
    img: 'width:86%;margin:7%;transform:rotate(2deg)',
    extra:
      '<div style="position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.14) 0 1px,transparent 1px 3px),repeating-linear-gradient(90deg,rgba(255,0,120,.08) 0 1px,transparent 1px 4px)"></div>',
  },
};
const fixture =
  (name: string): Html =>
  (img) =>
    `<img style="display:block;${img}" src="data:image/jpeg;base64,${readFileSync(resolve(fixtures, `${name}.jpg`)).toString('base64')}">`;
const card =
  (inner: string): Html =>
  (img) =>
    `<div style="${img};box-sizing:border-box;background:#fff;font-family:'Hiragino Sans',sans-serif;min-height:900px;border:14px solid #bbc4c8;color:#234">${inner}</div>`;
const button = (text: string | number, color: string) =>
  `<div style="display:inline-block;background:${color};color:#fff;font-size:64px;padding:30px 70px;border-radius:18px;margin:12px">${text}</div>`;
const header = '<div style="background:#e6f0f5;font-size:40px;padding:24px;font-weight:700">再来受付</div>';
const keypad = `<div style="padding:30px">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n) => button(n, '#667')).join('')}</div>`;
const others: Record<string, Html> = {
  'other-hospital': card(
    `<div style="background:#123e7a;color:#fff;font-size:44px;padding:28px">みどり総合病院 自動再来受付機</div><h1 style="font-size:64px;padding:40px">診察券を挿入してください</h1>${button('受付', '#1E7F3C')}${button('予約確認', '#555')}`,
  ),
  'lookalike-start': card(
    `${header}<h1 style="font-size:70px;padding:50px 40px">受付をはじめます</h1><p style="font-size:40px;padding:0 40px">診察券をお手元にご用意ください。</p><div style="text-align:right;padding-top:120px">${button('受付', '#1E7F3C')}</div>`,
  ),
  'lookalike-department': card(
    `${header}<h1 style="font-size:60px;padding:40px">受診する診療科を選択してください</h1>${button('内科', '#0B5CAD')}${button('外科', '#0B5CAD')}${button('整形外科', '#0B5CAD')}`,
  ),
  'confirm-with-name': card(
    `${header}<h1 style="font-size:60px;padding:40px">内容をご確認ください</h1><p style="font-size:44px;padding:0 40px;line-height:1.8">お名前 山田 太郎 様<br>診察券番号 12345678<br>生年月日 1948年4月1日</p><div style="text-align:right">${button('確定', '#1E7F3C')}</div>`,
  ),
  'id-keypad': card(
    `${header}<h1 style="font-size:56px;padding:40px">診察券番号を入力してください</h1>${keypad}`,
  ),
  'atm-pin': card(
    `<div style="background:#7a1212;color:#fff;font-size:44px;padding:28px">ATM お取引</div><h1 style="font-size:60px;padding:40px">暗証番号を入力してください</h1>${keypad}`,
  ),
  fastfood: card(
    `<div style="background:#c8102e;color:#fff;font-size:44px;padding:28px">ご注文はこちら</div><h1 style="font-size:60px;padding:40px">メニューを選んでください</h1>${button('バーガー', '#d98a00')}${button('セット', '#d98a00')}${button('お会計', '#1E7F3C')}`,
  ),
};
const NOT_OK = 'not ok';
const registered = ['start', 'department', 'confirmation', 'finished'];

const browser = await chromium.launch({ channel: 'chrome', args: ['--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 960, height: 1280 } });
const { token } = (await (
  await fetch(`${api}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  })
).json()) as { token: string };

// A few random corner pixels make every run's bytes new, so no result reuses an earlier identical image.
const jitter = () =>
  `<div style="position:absolute;left:${Math.floor(Math.random() * 40)}px;top:${1270 + Math.floor(Math.random() * 8)}px;width:5px;height:2px;background:rgb(${Math.floor(Math.random() * 255)},90,90)"></div>`;
async function shot(html: Html, d: Damage) {
  await page.setContent(
    `<body style="margin:0;width:960px;height:1280px;overflow:hidden;position:relative;${d.box}">${html(d.img)}${d.extra}${jitter()}</body>`,
  );
  await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
  return page.screenshot({ type: 'jpeg', quality: 85 });
}
let last = 0;
async function identify(image: Buffer) {
  const wait = MIN_GAP_MS - (Date.now() - last);
  if (wait > 0) await new Promise((done) => setTimeout(done, wait));
  last = Date.now();
  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(image)], { type: 'image/jpeg' }), 'capture.jpg');
  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(`${api}/identify`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch {
    return { label: 'HTTP network error', ms: Date.now() - started };
  }
  const ms = Date.now() - started;
  if (!response.ok) return { label: `HTTP ${response.status}`, ms };
  const body = (await response.json()) as { status: string; screen_id?: string };
  return { label: body.status === 'ok' ? `ok:${body.screen_id}` : body.status, ms };
}

const rows: { name: string; want: string; label: string; ms: number }[] = [];
async function run(name: string, html: Html, d: Damage, want: string) {
  const result = await identify(await shot(html, d));
  rows.push({ name, want, ...result });
  const passed =
    want === NOT_OK
      ? !result.label.startsWith('ok') && !result.label.startsWith('HTTP')
      : result.label === want;
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name.padEnd(30)} ${result.label.padEnd(18)} ${result.ms}ms`);
}
try {
  for (const screen of [...registered, 'personal-input'])
    for (const [name, d] of Object.entries(damage))
      await run(
        `${screen}/${name}`,
        fixture(screen),
        d,
        registered.includes(screen) ? `ok:${screen}` : NOT_OK,
      );
  for (const name of ['clean', 'glare']) await run(`blank/${name}`, fixture('blank'), damage[name]!, NOT_OK);
  for (const [other, html] of Object.entries(others))
    for (const name of ['clean', 'perspective']) await run(`${other}/${name}`, html, damage[name]!, NOT_OK);
} finally {
  await browser.close();
}
const reg = rows.filter((r) => r.want !== NOT_OK);
const neg = rows.filter((r) => r.want === NOT_OK);
const correct = reg.filter((r) => r.label === r.want).length;
const leaked = neg.filter((r) => r.label.startsWith('ok')).length;
const errors = rows.filter((r) => r.label.startsWith('HTTP')).length;
const times = rows.map((r) => r.ms).sort((a, b) => a - b);
console.log(`\nregistered correct ${correct}/${reg.length}`);
console.log(`must-not-guide safe ${neg.length - leaked}/${neg.length}`);
console.log(`http errors ${errors}`);
console.log(
  `ms p50 ${times[times.length >> 1]} p95 ${times[Math.floor(times.length * 0.95)]} max ${times.at(-1)}`,
);
process.exitCode = leaked || correct < 30 ? 1 : 0;
