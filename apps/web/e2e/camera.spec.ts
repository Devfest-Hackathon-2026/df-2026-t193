import { test, expect, spoken } from './fake-speech';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const sample = JSON.parse(
  readFileSync(new URL('../../../flows/hospital-recheck.json', import.meta.url), 'utf8'),
);
const primary = (page: Page) => page.locator('button.done');
async function fakeCamera(page: Page, mode: 'ready' | 'denied' | 'missing' | 'late' = 'ready') {
  await page.addInitScript(
    ({ mode }) => {
      const w = window as unknown as {
        tracks: MediaStreamTrack[];
        cameraRequests: MediaStreamConstraints[];
        allow: () => void;
      };
      w.tracks = [];
      w.cameraRequests = [];
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        value: async (constraints: MediaStreamConstraints) => {
          w.cameraRequests.push(constraints);
          if (mode === 'denied' || mode === 'missing')
            throw new DOMException('test', mode === 'denied' ? 'NotAllowedError' : 'NotFoundError');
          if (mode === 'late')
            await new Promise<void>((resolve) => {
              const previous = w.allow;
              w.allow = () => {
                previous?.();
                resolve();
              };
            });
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 480;
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#c8d9e0';
          ctx.fillRect(0, 0, 640, 480);
          const stream = canvas.captureStream(2);
          w.tracks.push(...stream.getTracks());
          return stream;
        },
      });
    },
    { mode },
  );
}
async function API(page: Page, status = 'ok') {
  await page.route('**/api/session', (route) =>
    route.fulfill({ json: { token: 'fixture', expires_at: new Date(Date.now() + 60000).toISOString() } }),
  );
  await page.route('**/api/identify', (route) =>
    route.fulfill({
      json:
        status === 'ok'
          ? {
              status: 'ok',
              flow_id: sample.flow_id,
              flow_version: '1',
              machine_id: sample.machine_id,
              screen_id: 'start',
              step_id: 's1',
            }
          : { status },
    }),
  );
  await page.route('**/api/flows/**', (route) => route.fulfill({ json: sample }));
}
test('real capture path sends JPEG, stops tracks, renders validated response', async ({ page }) => {
  await fakeCamera(page);
  await API(page);
  let uploads = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/identify')) {
      uploads++;
      expect(request.headers()['content-type']).toContain('multipart/form-data');
      expect(request.headers()['authorization']).toBe('Bearer fixture');
      expect(request.postDataBuffer()?.includes(Buffer.from('image/jpeg'))).toBe(true);
    }
  });
  await page.goto('/');
  await primary(page).click();
  await expect(primary(page)).toBeEnabled();
  await primary(page).click();
  await expect(page.locator('h1')).toHaveText('受付を押してください');
  expect(uploads).toBe(1);
  expect(
    await page.evaluate(() =>
      (window as unknown as { tracks: MediaStreamTrack[] }).tracks.every((t) => t.readyState === 'ended'),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      (window as unknown as { cameraRequests: MediaStreamConstraints[] }).cameraRequests.every(
        (c) => c.audio === false,
      ),
    ),
  ).toBe(true);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
});
for (const mode of ['denied', 'missing'] as const)
  test(`camera ${mode} is recoverable without upload`, async ({ page }) => {
    await fakeCamera(page, mode);
    await page.goto('/');
    await primary(page).click();
    await expect(primary(page)).toBeDisabled();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'もう一度試す' })).toBeVisible();
    await page.getByRole('button', { name: '前の画面に戻る' }).click();
    await expect(primary(page)).toHaveText('はじめる');
  });
test('late permission after cancel immediately releases acquired camera', async ({ page }) => {
  await fakeCamera(page, 'late');
  await page.goto('/');
  await primary(page).click();
  await expect(primary(page)).toBeDisabled();
  await page.getByRole('button', { name: '前の画面に戻る' }).click();
  await page.evaluate(() => (window as unknown as { allow: () => void }).allow());
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { tracks: MediaStreamTrack[] }).tracks.every((t) => t.readyState === 'ended'),
      ),
    )
    .toBe(true);
});
test('hidden document closes camera and requires manual restart', async ({ page }) => {
  await fakeCamera(page);
  await page.goto('/');
  await primary(page).click();
  await expect(primary(page)).toBeEnabled();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(primary(page)).toBeDisabled();
  expect(
    await page.evaluate(() =>
      (window as unknown as { tracks: MediaStreamTrack[] }).tracks.every((t) => t.readyState === 'ended'),
    ),
  ).toBe(true);
  await expect(page.getByRole('button', { name: 'もう一度試す' })).toBeVisible();
});
for (const code of [401, 413, 429, 503])
  test(`API ${code} never becomes demo success`, async ({ page }) => {
    await fakeCamera(page);
    await API(page);
    await page.route('**/api/identify', (route) => route.fulfill({ status: code, body: '{}' }));
    await page.goto('/');
    await primary(page).click();
    await expect(primary(page)).toBeEnabled();
    await primary(page).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.locator('h1')).toHaveText('画面を映してください');
    await expect(page.getByText('見本モード', { exact: true })).toHaveCount(0);
  });
test('invalid registered target rejects response', async ({ page }) => {
  await fakeCamera(page);
  await API(page);
  await page.route('**/api/flows/**', (route) => route.fulfill({ json: { ...sample, machine_id: 'other' } }));
  await page.goto('/');
  await primary(page).click();
  await expect(primary(page)).toBeEnabled();
  await primary(page).click();
  await expect(page.getByRole('alert')).toContainText('案内を確認できません');
});
test('cancel delayed API response cannot restore abandoned guide', async ({ page }) => {
  await fakeCamera(page);
  await API(page);
  let release: (() => void) | undefined;
  await page.route('**/api/identify', async (route) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await route.fulfill({
        json: {
          status: 'ok',
          flow_id: sample.flow_id,
          flow_version: '1',
          machine_id: sample.machine_id,
          screen_id: 'start',
          step_id: 's1',
        },
      });
    } catch {
      /* request was aborted */
    }
  });
  await page.goto('/');
  await primary(page).click();
  await expect(primary(page)).toBeEnabled();
  await primary(page).click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.getByRole('button', { name: 'やめて戻る' }).click();
  release!();
  await expect(primary(page)).toHaveText('はじめる');
  await page.waitForTimeout(200);
  await expect(primary(page)).toHaveText('はじめる');
});

test('camera disconnection disables capture and offers recovery', async ({ page }) => {
  await fakeCamera(page);
  await page.goto('/');
  await primary(page).click();
  await expect(primary(page)).toBeEnabled();
  await page.evaluate(() =>
    (window as unknown as { tracks: MediaStreamTrack[] }).tracks.forEach((t) =>
      t.dispatchEvent(new Event('ended')),
    ),
  );
  await expect(primary(page)).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('カメラが見つかりません');
});
for (const [width, height] of [
  [375, 553],
  [360, 560],
  [393, 659],
] as const)
  test(`live capture keeps take and help on screen at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await fakeCamera(page);
    await page.goto('/');
    await primary(page).click();
    await expect(primary(page)).toBeEnabled();
    const bottoms = await page.evaluate(() => ({
      take: document.querySelector('button.done')!.getBoundingClientRect().bottom,
      help: document.querySelector('button.help')!.getBoundingClientRect().bottom,
      height: innerHeight,
    }));
    expect(bottoms.take).toBeLessThanOrEqual(bottoms.height);
    expect(bottoms.help).toBeLessThanOrEqual(bottoms.height);
  });
test('camera permission wait says what to press, then moves to framing', async ({ page }) => {
  await fakeCamera(page, 'late');
  await page.goto('/');
  await primary(page).click();
  await expect(page.getByRole('status')).toContainText('「許可」を押してください');
  await expect.poll(() => spoken(page)).toEqual(['カメラの確認が出たら、「許可」を押してください。']);
  await page.evaluate(() => (window as unknown as { allow: () => void }).allow());
  await expect(primary(page)).toBeEnabled();
  await expect
    .poll(async () => (await spoken(page)).at(-1))
    .toBe('受付機の画面全体が枠に入ったら、「撮る」を押してください。');
});
test('a slow identification tells the user to wait', async ({ page }) => {
  await fakeCamera(page);
  await page.route('**/api/session', (route) =>
    route.fulfill({
      json: { token: 't', expires_at: new Date(Date.now() + 600000).toISOString() },
    }),
  );
  await page.route('**/api/identify', async (route) => {
    await new Promise((done) => setTimeout(done, 8000));
    await route.fulfill({ json: { status: 'unknown' } }).catch(() => {});
  });
  await page.goto('/');
  await primary(page).click();
  await expect(primary(page)).toBeEnabled();
  await primary(page).click();
  await expect(page.getByText('もう少しお待ちください。')).toBeVisible({ timeout: 7500 });
});
for (const [status, reason] of [
  ['sensitive', 'この画面は個人情報があるため、案内できません。'],
  ['unsupported', 'この機械には、まだ対応していません。'],
] as const)
  test(`${status} photo explains why it cannot be guided`, async ({ page }) => {
    await fakeCamera(page);
    await API(page, status);
    await page.goto('/');
    await primary(page).click();
    await expect(primary(page)).toBeEnabled();
    await primary(page).click();
    await expect(page.locator('h1')).toHaveText('スタッフに見せてください');
    await expect(page.getByText(reason)).toBeVisible();
    await expect.poll(async () => (await spoken(page)).at(-1)).toBe(reason);
    await expect(page.locator('.world img')).toHaveCount(0);
  });
test('rate limit shows the seconds left, then allows a manual retake only', async ({ page }) => {
  await fakeCamera(page);
  let identifyCalls = 0;
  await page.route('**/api/session', (route) =>
    route.fulfill({ json: { token: 't', expires_at: new Date(Date.now() + 600000).toISOString() } }),
  );
  await page.route('**/api/identify', (route) => {
    identifyCalls++;
    return route.fulfill({ status: 429, headers: { 'Retry-After': '3' }, json: {} });
  });
  await page.goto('/');
  await primary(page).click();
  await expect(primary(page)).toBeEnabled();
  await primary(page).click();
  await expect(page.getByText(/あと\d+秒で撮れます/)).toBeVisible();
  await expect(primary(page)).toBeDisabled();
  await expect(primary(page)).toBeEnabled({ timeout: 5000 });
  await expect(page.getByText(/あと\d+秒で撮れます/)).toHaveCount(0);
  await page.waitForTimeout(400);
  expect(identifyCalls).toBe(1);
});
test('real path badge says it is a demo device', async ({ page }) => {
  await fakeCamera(page);
  await page.goto('/');
  await expect(page.locator('.demo')).toHaveText('デモ用の端末');
  await primary(page).click();
  await expect(page.locator('.demo')).toHaveText('デモ用の端末');
});
