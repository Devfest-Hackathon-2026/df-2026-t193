import { describe, expect, it } from 'vitest';
import sample from '../../../flows/hospital-recheck.json';
import { directionIcon, getStep, nextStep, selectOption } from './engine';
import { flowSchema, parseFlow } from './flow';

const flow = parseFlow(sample);

describe('flow data', () => {
  it('accepts the sample flow', () => {
    expect(flow.flow_id).toBe('hospital-recheck');
  });

  it('rejects an unreviewed flow', () => {
    expect(() => parseFlow({ ...sample, reviewed: false })).toThrow('not reviewed');
  });

  it('rejects a link to a missing step', () => {
    const broken = structuredClone(sample);
    broken.steps.s1.next = 'missing';
    expect(flowSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a resumable stop with no next step', () => {
    const broken = structuredClone(sample) as { steps: { s4: { next?: string } } };
    delete broken.steps.s4.next;
    expect(flowSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects a stage outside the stage list', () => {
    const broken = structuredClone(sample);
    broken.steps.s1.stage = 99;
    expect(flowSchema.safeParse(broken).success).toBe(false);
  });
});

describe('flow engine', () => {
  it('moves through a guide step', () => {
    expect(nextStep(flow, 's1')).toBe('s2');
  });

  it('does not advance a choice step without an answer', () => {
    expect(nextStep(flow, 's2')).toBeNull();
  });

  it('follows the selected option', () => {
    expect(selectOption(flow, 's2', 'internal')).toBe('s3-internal');
  });

  it('ignores an option that is not on the step', () => {
    expect(selectOption(flow, 's2', 'dentistry')).toBeNull();
    expect(selectOption(flow, 's1', 'internal')).toBeNull();
  });

  it('continues after a resumable stop', () => {
    expect(nextStep(flow, 's4')).toBe('s5');
  });

  it('throws on an unknown step', () => {
    expect(() => getStep(flow, 'missing')).toThrow('Unknown step');
  });

  it('maps every grid cell to a direction', () => {
    expect(directionIcon({ row: 1, col: 1 })).toBe('north_west');
    expect(directionIcon({ row: 2, col: 2 })).toBe('adjust');
    expect(directionIcon({ row: 3, col: 3 })).toBe('south_east');
  });
});
