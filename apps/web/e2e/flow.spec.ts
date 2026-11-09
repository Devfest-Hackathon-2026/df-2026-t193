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
    await page.addStyleTag({ content: 'html{font-size:32px}' });
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
  await page.addStyleTag({ content: 'html{font-size:32px}' });
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
