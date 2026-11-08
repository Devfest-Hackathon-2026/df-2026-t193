import { describe, expect, it } from 'vitest';
import { demoFlow as flow } from '../api/demo';
import { guidanceSpeech } from './speech';
describe('guidanceSpeech', () => {
  it('joins instruction lines into one sentence with position and reason', () => {
    expect(guidanceSpeech(flow.steps.s1!)).toBe(
      '右下の、緑の『受付』を押してください。受付を始めるボタンです。',
    );
  });
  it('adds the phone reply hint only on the first guidance', () => {
    expect(guidanceSpeech(flow.steps.s1!, { first: true })).toContain('「押しました」を押してください');
    expect(guidanceSpeech(flow.steps.s5!)).not.toContain('押しました');
  });
  it('reads the question and every option without recommending one', () => {
    expect(guidanceSpeech(flow.steps.s2!)).toBe(
      'どの科を受診しますか。内科、外科、整形外科から選んでください。',
    );
  });
  it('never asks for personal information at the stop', () => {
    const text = guidanceSpeech(flow.steps.s4!);
    expect(text).toContain('声に出さず');
    expect(text.startsWith('ここからは、ご自分で入力してください。')).toBe(true);
  });
  it('closes the guidance at the end', () => {
    expect(guidanceSpeech(flow.steps.s6!)).toBe('案内はここまでです。おつかれさまでした。');
  });
  it('covers every registered step with non-empty speech', () => {
    for (const step of Object.values(flow.steps)) expect(guidanceSpeech(step).length).toBeGreaterThan(5);
  });
});
