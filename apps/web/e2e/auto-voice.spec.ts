import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fakeSpeech, spoken } from './fake-speech';
const manifest = JSON.parse(
  readFileSync(new URL('../src/content/voice-manifest.json', import.meta.url), 'utf8'),
) as { voice: string | null; items: Record<string, string> };
const primary = (page: Page) => page.locator('button.done');
const voice = (page: Page) => page.locator('button.voice');
async function begin(page: Page) {
  await page.goto('/demo');
  await primary(page).click();
  await primary(page).click();
  await expect(page.locator('h1')).toHaveText('受付を押してください');
}
test('each step speaks once on arrival after the start tap', async ({ page }) => {
  await fakeSpeech(page, 'ok', 1500);
  await begin(page);
  await expect(voice(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(voice(page)).toHaveText('声を止める');
  expect(await spoken(page)).toEqual([
    '右下の、緑の『受付』を押してください。受付を始めるボタンです。押したら、この画面の「押しました」を押してください。',
  ]);
  await primary(page).click();
  await expect(page.locator('h1')).toHaveText('どの科ですか？');
  await expect.poll(() => spoken(page)).toHaveLength(2);
  expect((await spoken(page))[1]).toBe('どの科を受診しますか。内科、外科、整形外科から選んでください。');
  // Selecting only changes the choice; it must not replay or advance.
  await page.getByRole('radio', { name: '外科', exact: true }).check();
  await page.waitForTimeout(400);
  expect(await spoken(page)).toHaveLength(2);
  await primary(page).click();
  await expect(page.locator('h1')).toHaveText('外科を押してください');
  await expect
    .poll(async () => (await spoken(page))[2])
    .toContain('上の真ん中の、青の『外科』を押してください');
  expect((await spoken(page))[2]).not.toContain('押しました');
});
test('help stops speech and closing it does not replay', async ({ page }) => {
  await fakeSpeech(page, 'ok', 3000);
  await begin(page);
  await expect(voice(page)).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '困ったとき' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { speaking: boolean }).speaking))
    .toBe(false);
  await page.getByRole('button', { name: '案内に戻る', exact: true }).click();
  await page.waitForTimeout(500);
  expect(await spoken(page)).toHaveLength(1);
  await expect(voice(page)).toHaveAttribute('aria-pressed', 'false');
  await voice(page).click();
  await expect.poll(() => spoken(page)).toHaveLength(2);
});
test('personal-info stop speaks the safety copy and the end closes', async ({ page }) => {
  await fakeSpeech(page, 'ok', 100);
  await begin(page);
  await primary(page).click();
  await page.getByRole('radio', { name: '内科', exact: true }).check();
  await primary(page).click();
  await primary(page).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect
    .poll(async () => (await spoken(page)).at(-1))
    .toBe('ここからは、ご自分で入力してください。番号や個人情報は声に出さず、受付機に入力してください。');
  await page.getByRole('button', { name: '入力しました', exact: true }).click();
  await primary(page).click();
  await expect(page.locator('h1')).toHaveText('案内はここまでです');
  await expect.poll(async () => (await spoken(page)).at(-1)).toBe('案内はここまでです。おつかれさまでした。');
});
test('blocked auto start stays quiet and leaves the play button', async ({ page }) => {
  await fakeSpeech(page, 'blocked');
  await begin(page);
  await expect.poll(() => spoken(page)).toHaveLength(1);
  await page.waitForTimeout(200);
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(voice(page)).toHaveText('もう一度聞く');
  await voice(page).click();
  await expect(page.getByRole('status')).toContainText('音声を再生できません');
});
test('background stops speech', async ({ page }) => {
  await fakeSpeech(page, 'ok', 5000);
  await begin(page);
  await expect(voice(page)).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(voice(page)).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => (window as unknown as { speaking: boolean }).speaking)).toBe(false);
});
test('prerecorded voice file plays when generated, without device speech', async ({ page }) => {
  test.skip(!manifest.voice, 'voice files not generated yet');
  await fakeSpeech(page, 'ok', 400, true);
  const played: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/assets/tonari/voice/')) played.push(new URL(r.url()).pathname);
  });
  await begin(page);
  await expect.poll(() => played.at(-1)).toMatch(/\/s1-first\.mp3$/);
  await expect(voice(page)).toHaveAttribute('aria-pressed', 'true');
  expect(await spoken(page)).toEqual([]);
  await voice(page).click();
  await expect(voice(page)).toHaveAttribute('aria-pressed', 'false');
});
test('capture screen speaks how to shoot, and errors are spoken on return', async ({ page }) => {
  await fakeSpeech(page, 'ok', 100);
  await page.goto('/demo');
  await primary(page).click();
  await expect
    .poll(async () => (await spoken(page)).at(-1))
    .toBe('見本の画面で進みます。「撮る」を押してください。');
  await primary(page).click();
  await expect(page.locator('h1')).toHaveText('受付を押してください');
  await page.getByRole('button', { name: '困ったとき' }).click();
  await page.getByRole('button', { name: '違う画面が出ています' }).click();
  await page.locator('select').selectOption('unknown');
  await primary(page).click();
  await expect(page.getByRole('alert')).toContainText('確認できません');
  await expect
    .poll(async () => (await spoken(page)).at(-1))
    .toBe('画面を確認できませんでした。もう一度撮ってください。');
});
test('auto voice can be turned off from help and stays off after reload', async ({ page }) => {
  await fakeSpeech(page, 'ok', 100);
  await begin(page);
  await expect.poll(() => spoken(page)).toHaveLength(1);
  await page.getByRole('button', { name: '困ったとき' }).click();
  await page.getByRole('button', { name: '自動の読み上げを止める' }).click();
  await expect(page.getByRole('button', { name: '自動の読み上げを始める' })).toBeVisible();
  await page.getByRole('button', { name: '案内に戻る', exact: true }).click();
  await primary(page).click();
  await expect(page.locator('h1')).toHaveText('どの科ですか？');
  await page.waitForTimeout(500);
  expect(await spoken(page)).toHaveLength(1);
  // Manual play still works.
  await voice(page).click();
  await expect.poll(() => spoken(page)).toHaveLength(2);
  await page.reload();
  await page.getByRole('button', { name: '使い方を見る' }).click();
  await expect(page.getByRole('button', { name: '自動の読み上げを始める' })).toBeVisible();
  await page.getByRole('button', { name: '自動の読み上げを始める' }).click();
  await expect(page.getByRole('button', { name: '自動の読み上げを止める' })).toBeVisible();
});
test('staff screen speaks the request only when tapped', async ({ page }) => {
  await fakeSpeech(page, 'ok', 100);
  await begin(page);
  await expect.poll(() => spoken(page)).toHaveLength(1);
  await page.getByRole('button', { name: '困ったとき' }).click();
  await page.getByRole('button', { name: 'スタッフに聞きたい' }).click();
  await expect(page.locator('h1')).toHaveText('スタッフに見せてください');
  await page.waitForTimeout(500);
  expect(await spoken(page)).toHaveLength(1);
  await page.getByRole('button', { name: '読み上げる' }).click();
  await expect
    .poll(async () => (await spoken(page)).at(-1))
    .toBe('操作が分かりません。手伝っていただけますか。');
});
test('help on the capture screen stops speech and closing it does not replay', async ({ page }) => {
  await fakeSpeech(page, 'ok', 5000);
  const speaking = () => page.evaluate(() => (window as unknown as { speaking: boolean }).speaking);
  await page.goto('/demo');
  await primary(page).click();
  await expect.poll(speaking).toBe(true);
  await page.getByRole('button', { name: '困ったとき' }).click();
  await expect.poll(speaking).toBe(false);
  await page.getByRole('button', { name: '案内に戻る', exact: true }).click();
  await page.waitForTimeout(500);
  expect(await speaking()).toBe(false);
  expect(await spoken(page)).toHaveLength(1);
});
