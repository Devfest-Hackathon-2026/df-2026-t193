import { test, expect } from './fake-speech';
import type { Page } from '@playwright/test';
import { resolve } from 'node:path';
const primary = (page: Page) => page.locator('button.done');
async function begin(page: Page) {
  await page.goto('/demo');
  await primary(page).click();
  await primary(page).click();
  await expect(page.locator('h1')).toHaveText('受付を押してください');
}
for (const department of ['内科', '外科', '整形外科'])
  test(`complete ${department} with explicit choice and stop`, async ({ page }) => {
    await begin(page);
    await primary(page).click();
    await expect(primary(page)).toBeDisabled();
    await page.getByRole('radio', { name: department, exact: true }).check();
    await expect(page.locator('h1')).toHaveText('どの科ですか？');
    await primary(page).click();
    await expect(page.locator('h1')).toHaveText(`${department}を押してください`);
    await primary(page).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: '案内に戻る', exact: true }).click();
    await expect(primary(page)).toHaveText('入力の案内を見る');
    await primary(page).click();
    await page.getByRole('button', { name: '入力しました', exact: true }).click();
    await expect(page.locator('h1')).toHaveText('確定を押してください');
    await primary(page).click();
    await expect(page.locator('h1')).toHaveText('案内はここまでです');
    await primary(page).click();
    await expect(primary(page)).toHaveText('はじめる');
  });
test('double click cannot skip choice or stop', async ({ page }) => {
  await begin(page);
  await primary(page).dblclick();
  await expect(page.locator('h1')).toHaveText('どの科ですか？');
  await page.getByRole('radio', { name: '内科', exact: true }).check();
  await primary(page).dblclick();
  await expect(page.locator('h1')).toHaveText('内科を押してください');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
test('retake cancel preserves selection and accepted screen retake resets it', async ({ page }) => {
  await begin(page);
  await primary(page).click();
  await page.getByRole('radio', { name: '外科', exact: true }).check();
  await page.getByRole('button', { name: '困ったとき' }).click();
  await page.getByRole('button', { name: '違う画面が出ています' }).click();
  await page.getByRole('button', { name: '前の画面に戻る' }).click();
  await expect(page.getByRole('radio', { name: '外科', exact: true })).toBeChecked();
  await page.getByRole('button', { name: '困ったとき' }).click();
  await page.getByRole('button', { name: '違う画面が出ています' }).click();
  await page.locator('select').selectOption('department');
  await primary(page).click();
  await expect(page.locator('h1')).toHaveText('どの科ですか？');
  await expect(primary(page)).toBeDisabled();
});
test('two unknowns reach staff and help is a display, not a call', async ({ page }) => {
  await begin(page);
  await page.getByRole('button', { name: '困ったとき' }).click();
  await page.getByRole('button', { name: '違う画面が出ています' }).click();
  await page.locator('select').selectOption('unknown');
  await primary(page).click();
  await expect(page.getByRole('alert')).toContainText('確認できません');
  await page.locator('select').selectOption('unknown');
  await primary(page).click();
  await expect(page.locator('h1')).toHaveText('スタッフに見せてください');
});
test('cancel pending result cannot advance', async ({ page }) => {
  await page.goto('/demo');
  await primary(page).click();
  await primary(page).click();
  await page.getByRole('button', { name: 'やめて戻る' }).click();
  await expect(primary(page)).toHaveText('はじめる');
  await page.waitForTimeout(600);
  await expect(primary(page)).toHaveText('はじめる');
});
test('sheet traps focus, Escape restores invoker, no background action', async ({ page }) => {
  await begin(page);
  const help = page.getByRole('button', { name: '困ったとき' });
  await help.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(help).toBeFocused();
});
test('missing Japanese voice keeps manual flow available', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'speechSynthesis', { value: { getVoices: () => [], cancel: () => {} } }),
  );
  await begin(page);
  await page.getByRole('button', { name: 'もう一度聞く', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('音声を再生できません');
  await primary(page).click();
  await expect(page.locator('h1')).toHaveText('どの科ですか？');
});
for (const size of [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
])
  test(`approved layout and 200% ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/demo');
    const check = async (name: string) => {
      await page.locator('.world img').evaluate((img: HTMLImageElement) => img.decode());
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const b = await primary(page).boundingBox();
      expect(b!.y + b!.height).toBeLessThanOrEqual(size.height + 1);
      if (process.env.SHOT_DIR)
        await page.screenshot({ path: resolve(process.env.SHOT_DIR, `${name}-${size.width}.png`) });
    };
    await check('start');
    await primary(page).click();
    await check('capture');
    await primary(page).click();
    await expect(page.locator('h1')).toHaveText('受付を押してください');
    await check('guide');
    const world = await page.locator('.world').boundingBox(),
      panel = await page.locator('.guide-panel').boundingBox();
    const scale = Math.max(world!.width / 400, world!.height / 450);
    expect(world!.y + 310 * scale).toBeLessThan(panel!.y);
    await primary(page).click();
    await check('choice');
    await page.getByRole('radio', { name: '整形外科', exact: true }).check();
    await primary(page).click();
    await primary(page).click();
    await page.getByRole('button', { name: '入力しました' }).click();
    await primary(page).click();
    await check('done');
    await page.addStyleTag({ content: ':root{font-size:32px!important}' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await primary(page).click();
    await primary(page).click();
    await primary(page).click();
    await expect(page.locator('h1')).toHaveText('受付を押してください');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
test('dark mode and reduced motion retain contrast tokens', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await begin(page);
  expect(await page.locator('.guide-panel').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(
    'rgb(21, 29, 33)',
  );
  await expect(primary(page)).toBeVisible();
});
test('mock kiosk completes by its own buttons', async ({ page }) => {
  await page.goto('/mock/hospital');
  await expect(page.getByText('デモ用の模擬端末')).toBeVisible();
  await page.getByRole('button', { name: '受付', exact: true }).click();
  await page.getByRole('button', { name: '外科', exact: true }).click();
  await expect(page.locator('input')).toHaveCount(0);
  await page.getByRole('button', { name: '入力を終える（見本）' }).click();
  await page.getByRole('button', { name: '確定', exact: true }).click();
  await expect(page.locator('h1')).toHaveText('ありがとうございました');
});
test('all screens reflow at 200% and dialogs in landscape', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/demo');
  await page.addStyleTag({ content: ':root{font-size:32px!important}' });
  const noOverflow = async () =>
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await noOverflow();
  await primary(page).click();
  await noOverflow();
  await primary(page).click();
  await expect(page.locator('h1')).toHaveText('受付を押してください');
  await noOverflow();
  await primary(page).click();
  await noOverflow();
  await page.getByRole('radio', { name: '整形外科', exact: true }).check();
  await primary(page).click();
  await noOverflow();
  await primary(page).click();
  await page.setViewportSize({ width: 844, height: 390 });
  await noOverflow();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '入力しました' }).click();
  await noOverflow();
  await primary(page).click();
  await noOverflow();
});
test('back cancels capture and reopening help does not change the step', async ({ page }) => {
  await begin(page);
  await page.getByRole('button', { name: '困ったとき' }).click();
  await page.goBack();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('h1')).toHaveText('受付を押してください');
  await page.getByRole('button', { name: '困ったとき' }).click();
  await page.getByRole('button', { name: '違う画面が出ています' }).click();
  await page.goBack();
  await expect(page.locator('h1')).toHaveText('受付を押してください');
});
test('staff screen returns to the guidance by default and keeps restart secondary', async ({ page }) => {
  await begin(page);
  await page.getByRole('button', { name: '困ったとき' }).click();
  await page.getByRole('button', { name: 'スタッフに聞きたい' }).click();
  await expect(primary(page)).toHaveText('案内に戻る');
  await expect(page.getByRole('button', { name: 'はじめに戻る', exact: true })).toBeVisible();
  await expect(page.getByText('案内できません')).toHaveCount(0);
  await primary(page).click();
  await expect(page.locator('h1')).toHaveText('受付を押してください');
});
test('how-to sheet closes with a close button', async ({ page }) => {
  await page.goto('/demo');
  await page.getByRole('button', { name: '使い方を見る' }).click();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(primary(page)).toHaveText('はじめる');
});
test('a mistaken press can go back one step, and the first step offers no back', async ({ page }) => {
  await begin(page);
  await page.getByRole('button', { name: '困ったとき' }).click();
  await expect(page.getByRole('button', { name: '一つ前の案内に戻る' })).toHaveCount(0);
  await page.getByRole('button', { name: '案内に戻る', exact: true }).click();
  await primary(page).click();
  await expect(page.locator('h1')).toHaveText('どの科ですか？');
  await page.getByRole('button', { name: '困ったとき' }).click();
  await page.getByRole('button', { name: '一つ前の案内に戻る' }).click();
  await expect(page.locator('h1')).toHaveText('受付を押してください');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
test('the choice button says what is needed before a selection', async ({ page }) => {
  await begin(page);
  await primary(page).click();
  await expect(primary(page)).toBeDisabled();
  await expect(primary(page)).toHaveText('科を選んでください');
});
test('scene pictures are fetched before their steps', async ({ page }) => {
  const seen: string[] = [];
  page.on('request', (r) => seen.push(r.url()));
  await begin(page);
  await expect.poll(() => seen.some((u) => u.endsWith('/terminal-orthopedics.svg'))).toBe(true);
  await expect.poll(() => seen.some((u) => u.endsWith('/terminal-confirm.svg'))).toBe(true);
});
for (const [width, height] of [
  [375, 553],
  [360, 560],
] as const)
  test(`guide and choice keep the reply and help on screen at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await begin(page);
    const fits = async () => {
      const box = await page.evaluate(() => ({
        done: document.querySelector('button.done')!.getBoundingClientRect().bottom,
        help: document.querySelector('button.help')!.getBoundingClientRect().bottom,
        height: innerHeight,
      }));
      expect(box.done).toBeLessThanOrEqual(box.height);
      expect(box.help).toBeLessThanOrEqual(box.height);
    };
    await fits();
    // The 「ここ」 marker (scene y 225-310 of 450) stays in the visible part of the picture.
    const target = await page.evaluate(() => {
      const world = document.querySelector('.world')!.getBoundingClientRect();
      const panel = document.querySelector('.guide-panel')!.getBoundingClientRect();
      const height = (world.width * 450) / 400;
      const offset = (height - world.height) * 0.4;
      const toScreen = (y: number) => world.top + (y / 450) * height - offset;
      return { top: toScreen(225), bottom: toScreen(310), worldTop: world.top, panelTop: panel.top };
    });
    expect(target.top).toBeGreaterThanOrEqual(target.worldTop);
    expect(target.bottom).toBeLessThanOrEqual(target.panelTop);
    await primary(page).click();
    await expect(page.locator('h1')).toHaveText('どの科ですか？');
    await fits();
  });
test('the screen stays awake during guidance and is released at the end', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { wake: { requested: number; released: number } };
    w.wake = { requested: 0, released: 0 };
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => {
          w.wake.requested++;
          return {
            released: false,
            release: async () => {
              w.wake.released++;
            },
          };
        },
      },
    });
  });
  const wake = () =>
    page.evaluate(() => (window as unknown as { wake: { requested: number; released: number } }).wake);
  await begin(page);
  await expect.poll(async () => (await wake()).requested).toBeGreaterThan(0);
  await primary(page).click();
  await page.getByRole('radio', { name: '内科', exact: true }).check();
  await primary(page).click();
  await primary(page).click();
  await page.getByRole('button', { name: '入力しました', exact: true }).click();
  await primary(page).click();
  await expect(page.locator('h1')).toHaveText('案内はここまでです');
  await expect.poll(async () => (await wake()).released).toBeGreaterThan(0);
});
test('guidance works without wake lock support', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: () => Promise.reject(new DOMException('no', 'NotAllowedError')) },
    });
  });
  await begin(page);
  await primary(page).click();
  await expect(page.locator('h1')).toHaveText('どの科ですか？');
});
test('help sheet fits a short screen with its close button visible', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 553 });
  await begin(page);
  await primary(page).click();
  await expect(page.locator('h1')).toHaveText('どの科ですか？');
  await page.getByRole('button', { name: '困ったとき' }).click();
  await expect(page.getByRole('button', { name: '一つ前の案内に戻る' })).toBeVisible();
  const close = await page.getByRole('button', { name: '案内に戻る', exact: true }).boundingBox();
  expect(close!.y + close!.height).toBeLessThanOrEqual(553);
});
test('closing the personal-information stop never tells the user to press a button', async ({ page }) => {
  await begin(page);
  await primary(page).click();
  await page.getByRole('radio', { name: '内科', exact: true }).check();
  await primary(page).click();
  await primary(page).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '案内に戻る', exact: true }).click();
  await expect(page.locator('h1')).toHaveText('ここからはご自分で');
  await expect(page.locator('h1 .key')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /拡大/ })).toHaveCount(0);
  await primary(page).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
test('browser back undoes one step during guidance', async ({ page }) => {
  await begin(page);
  await primary(page).click();
  await expect(page.locator('h1')).toHaveText('どの科ですか？');
  await page.goBack();
  await expect(page.locator('h1')).toHaveText('受付を押してください');
});
test('browser back on the first step returns to capture, and cancel restores it', async ({ page }) => {
  await begin(page);
  await page.goBack();
  await expect(page.locator('h1')).toHaveText('画面を映してください');
  await page.getByRole('button', { name: '前の画面に戻る' }).click();
  await expect(page.locator('h1')).toHaveText('受付を押してください');
});
test('browser back on the staff screen returns to the guidance', async ({ page }) => {
  await begin(page);
  await page.getByRole('button', { name: '困ったとき' }).click();
  await page.getByRole('button', { name: 'スタッフに聞きたい' }).click();
  await expect(page.locator('h1')).toHaveText('スタッフに見せてください');
  await page.goBack();
  await expect(page.locator('h1')).toHaveText('受付を押してください');
});
test('browser back on the end screen restarts', async ({ page }) => {
  await begin(page);
  await primary(page).click();
  await page.getByRole('radio', { name: '内科', exact: true }).check();
  await primary(page).click();
  await primary(page).click();
  await page.getByRole('button', { name: '入力しました', exact: true }).click();
  await primary(page).click();
  await expect(page.locator('h1')).toHaveText('案内はここまでです');
  await page.goBack();
  await expect(primary(page)).toHaveText('はじめる');
});
for (const [width, height] of [
  [1180, 820],
  [1024, 768],
  [1280, 800],
  [820, 1180],
] as const)
  test(`mock kiosk fits a ${width}x${height} tablet`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/mock/hospital');
    const box = await page.evaluate(() => ({
      hit: [...document.querySelectorAll('.kiosk-hit')].at(-1)!.getBoundingClientRect().bottom,
      reset: document.querySelector('.kiosk-back')!.getBoundingClientRect().bottom,
      height: innerHeight,
    }));
    expect(box.hit).toBeLessThanOrEqual(box.height);
    expect(box.reset).toBeLessThanOrEqual(box.height);
  });
