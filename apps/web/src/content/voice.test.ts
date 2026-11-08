import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { demoFlow as flow } from '../api/demo';
import { fixedSpeech, speechVariants } from './speech';
import { voiceFile, voiceManifest, type VoiceManifest } from './voice';
const sample: VoiceManifest = {
  flow_id: 'hospital-recheck',
  version: '1',
  voice: 'test',
  speaking_rate: 1,
  items: { 'あ。': '/assets/tonari/voice/a.mp3' },
  common: { 'う。': '/assets/tonari/voice/common/u.mp3' },
};
describe('voiceFile', () => {
  it('matches the exact sentence of the same flow version only', () => {
    expect(voiceFile(flow, 'あ。', sample)).toBe('/assets/tonari/voice/a.mp3');
    expect(voiceFile(flow, 'い。', sample)).toBeUndefined();
    expect(voiceFile(flow, 'toString', sample)).toBeUndefined();
    expect(voiceFile({ ...flow, version: '2' }, 'あ。', sample)).toBeUndefined();
  });
  it('finds fixed copy without a flow and never flow items without one', () => {
    expect(voiceFile(null, 'う。', sample)).toBe('/assets/tonari/voice/common/u.mp3');
    expect(voiceFile(flow, 'う。', sample)).toBe('/assets/tonari/voice/common/u.mp3');
    expect(voiceFile(null, 'あ。', sample)).toBeUndefined();
  });
  it('lists one sentence per step plus a first-time variant for guide steps', () => {
    const variants = speechVariants(flow);
    expect(variants.map((v) => v.file)).toContain('s1-first');
    expect(new Set(variants.map((v) => v.file)).size).toBe(variants.length);
  });
  it('generated manifest, when present, covers every sentence with a file on disk', () => {
    if (!voiceManifest.voice) return;
    for (const { text } of [...speechVariants(flow), ...fixedSpeech()]) {
      const path = voiceFile(flow, text);
      expect(path, text).toBeDefined();
      expect(existsSync(resolve(__dirname, '../../public', `.${path}`)), path).toBe(true);
    }
  });
});
