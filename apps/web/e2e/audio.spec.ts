import { test, expect, type Page } from '@playwright/test';
async function setup(page: Page, fail = false) {
  await page.addInitScript(
    ({ fail }) => {
      const w = window as unknown as { players: { paused: boolean; src: string }[] };
      w.players = [];
      class FakeAudio {
        paused = true;
        src: string;
        onended: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(src: string) {
          this.src = src;
          w.players.push(this);
        }
        async play() {
          if (fail) throw new DOMException('Autoplay blocked', 'NotAllowedError');
          this.paused = false;
        }
        pause() {
          this.paused = true;
        }
        removeAttribute() {
          this.src = '';
        }
        load() {}
      }
      Object.defineProperty(window, 'Audio', { value: FakeAudio });
    },
    { fail },
  );
  await page.goto('/demo');
  await page.evaluate(async () => {
    const path = '/e2e/audio-harness.tsx';
    const harness = await import(path);
    harness.mount();
  });
}
test('audio stops on next step and never overlaps', async ({ page }) => {
  await setup(page);
  await page.locator('#play-test').click();
  await expect(page.locator('#audio-state')).toHaveText('playing');
  await page.locator('#next-test').click();
  await expect(page.locator('#audio-state')).toHaveText('idle');
  expect(
    await page.evaluate(() =>
      (window as unknown as { players: { paused: boolean }[] }).players.every((p) => p.paused),
    ),
  ).toBe(true);
  await page.locator('#play-test').click();
  expect(
    await page.evaluate(
      () => (window as unknown as { players: { paused: boolean }[] }).players.filter((p) => !p.paused).length,
    ),
  ).toBe(1);
});
test('audio reports autoplay failure honestly', async ({ page }) => {
  await setup(page, true);
  await page.locator('#play-test').click();
  await expect(page.locator('#audio-state')).toHaveText('failed');
});
test('audio resource error releases player', async ({ page }) => {
  await setup(page);
  await page.locator('#play-test').click();
  await page.evaluate(() =>
    (window as unknown as { players: { onerror: () => void }[] }).players[0]!.onerror(),
  );
  await expect(page.locator('#audio-state')).toHaveText('failed');
  expect(
    await page.evaluate(() => (window as unknown as { players: { src: string }[] }).players[0]!.src),
  ).toBe('');
});
test('audio stops on background', async ({ page }) => {
  await setup(page);
  await page.locator('#play-test').click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#audio-state')).toHaveText('idle');
});
