import { describe, it, expect } from 'vitest';
import sample from '../../../flows/hospital-recheck.json';
import { identifySchema, validateIdentification } from './identify';
import { parseFlow } from './flow';
const ok = {
  status: 'ok',
  flow_id: sample.flow_id,
  flow_version: '1',
  machine_id: sample.machine_id,
  screen_id: 'start',
  step_id: 's1',
} as const;
describe('registration boundary', () => {
  it('rejects malformed and raw model text', () => {
    for (const result of [null, {}, { status: 'ok' }, { ...ok, instruction: '<script>bad</script>' }])
      expect(identifySchema.safeParse(result).success).toBe(false);
  });
  it.each(['flow_id', 'machine_id', 'flow_version', 'screen_id', 'step_id'] as const)(
    'rejects mismatched %s',
    (field) => expect(() => validateIdentification({ ...ok, [field]: 'wrong' }, sample)).toThrow(),
  );
  it('accepts registered menu first step', () =>
    expect(validateIdentification({ ...ok, screen_id: 'department', step_id: 's2' }, sample).version).toBe(
      '1',
    ));
  it('rejects duplicate screens', () =>
    expect(() => parseFlow({ ...sample, screens: [...sample.screens, sample.screens[0]] })).toThrow());
  it('rejects duplicate options', () => {
    const data = structuredClone(sample);
    data.steps.s2.options.push(data.steps.s2.options[0]!);
    expect(() => parseFlow(data)).toThrow();
  });
  it('rejects unsupported schema and unreviewed data', () => {
    expect(() => parseFlow({ ...sample, schema_version: 2 })).toThrow();
    expect(() => validateIdentification(ok, { ...sample, reviewed: false })).toThrow();
  });
});
