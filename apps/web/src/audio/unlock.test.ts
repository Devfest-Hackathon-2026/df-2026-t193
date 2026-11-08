import { describe, expect, it } from 'vitest';
import { bestJapaneseVoice } from './unlock';
const v = (name: string, lang = 'ja-JP', localService = true, voiceURI = name) =>
  ({ name, lang, localService, voiceURI }) as SpeechSynthesisVoice;
describe('bestJapaneseVoice', () => {
  it('skips novelty voices that come first on macOS', () => {
    const list = [
      v('Eddy (日本語（日本）)'),
      v('Grandma (日本語（日本）)'),
      v('Kyoko'),
      v('Rocko (日本語（日本）)'),
    ];
    expect(bestJapaneseVoice(list)?.name).toBe('Kyoko');
  });
  it('prefers enhanced voices and never uses remote or other-language voices', () => {
    expect(bestJapaneseVoice([v('Kyoko'), v('Kyoko (Enhanced)')])?.name).toBe('Kyoko (Enhanced)');
    expect(bestJapaneseVoice([v('Google 日本語', 'ja-JP', false), v('Samantha', 'en-US')])).toBeNull();
  });
  it('returns null when only novelty voices exist', () => {
    expect(bestJapaneseVoice([v('Eddy (日本語（日本）)'), v('Shelley (日本語（日本）)')])).toBeNull();
  });
});
