import { test as base, type Page } from '@playwright/test';
export type SpeechMode = 'ok' | 'blocked' | 'none';
/**
 * Synthetic on-device speech. Records text only in page memory; no sound, no real voice.
 * Prerecorded voice files are blocked unless `files` is set, so the speech path is exercised.
 */
export async function fakeSpeech(page: Page, mode: SpeechMode = 'ok', duration = 400, files = false) {
  if (!files) await page.route('**/assets/tonari/voice/**', (route) => route.abort());
  await page.addInitScript(
    ({ mode, duration }) => {
      const w = window as unknown as { spoken: string[]; cancels: number; speaking: boolean };
      w.spoken = [];
      w.cancels = 0;
      w.speaking = false;
      const timers: ReturnType<typeof setTimeout>[] = [];
      type U = { text: string; onstart?: () => void; onend?: () => void; onerror?: (e: unknown) => void };
      class FakeUtterance {
        text: string;
        lang = '';
        voice: unknown = null;
        volume = 1;
        onstart: (() => void) | null = null;
        onend: (() => void) | null = null;
        onerror: ((e: unknown) => void) | null = null;
        constructor(text = '') {
          this.text = text;
        }
      }
      const synth = {
        getVoices: () => (mode === 'none' ? [] : [{ lang: 'ja-JP', localService: true, name: 'Fake ja' }]),
        addEventListener() {},
        removeEventListener() {},
        speak(u: U) {
          if (!u.text) return;
          w.spoken.push(u.text);
          if (mode === 'blocked') {
            timers.push(setTimeout(() => u.onerror?.({ error: 'not-allowed' }), 10));
            return;
          }
          timers.push(
            setTimeout(() => {
              w.speaking = true;
              u.onstart?.();
            }, 10),
          );
          timers.push(
            setTimeout(() => {
              w.speaking = false;
              u.onend?.();
            }, duration),
          );
        },
        cancel() {
          w.cancels++;
          w.speaking = false;
          timers.splice(0).forEach(clearTimeout);
        },
      };
      Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true });
    },
    { mode, duration },
  );
}
export const spoken = (page: Page) => page.evaluate(() => (window as unknown as { spoken: string[] }).spoken);
/** Default for app flows: deterministic speech so host voices never affect the run. */
export const test = base.extend({
  page: async ({ page }, use) => {
    await fakeSpeech(page);
    await use(page);
  },
});
export { expect } from '@playwright/test';
