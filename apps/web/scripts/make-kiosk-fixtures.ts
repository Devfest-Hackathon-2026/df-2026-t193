/**
 * Renders the synthetic mock kiosk (/mock/hospital) into JPEG fixtures for backend contract checks.
 * These are screenshots of our own demo kiosk, not photos of real machines or people.
 *
 *   npm run dev            # in another terminal
 *   npm run fixtures:kiosk -- http://127.0.0.1:5173
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = (process.argv.slice(2).find((a) => a.startsWith('http')) ?? 'http://127.0.0.1:5173').replace(
  /\/$/,
  '',
);
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../e2e/fixtures/kiosk');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 820, height: 1180 } });
  const shot = async (name: string) => {
    await page.waitForTimeout(200);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: resolve(out, `${name}.jpg`), type: 'jpeg', quality: 85, fullPage: true });
    console.log(`${name}.jpg`);
  };
  await page.goto(`${base}/mock/hospital`);
  await shot('start');
  await page.getByRole('button', { name: '受付', exact: true }).click();
  await shot('department');
  await page.getByRole('button', { name: '内科', exact: true }).click();
  await shot('personal-input');
  await page.getByRole('button', { name: '入力を終える（見本）' }).click();
  await shot('confirmation');
  await page.getByRole('button', { name: '確定', exact: true }).click();
  await shot('finished');
  await page.setContent('<body style="margin:0;background:#8a9399"></body>');
  await shot('blank');
} finally {
  await browser.close();
}
