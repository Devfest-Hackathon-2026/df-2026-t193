import { describe, expect, it } from 'vitest';
import { reducer, initialState, type AppState } from './machine';
import { demoFlow } from '../api/demo';
const result = {
  status: 'ok',
  flow_id: demoFlow.flow_id,
  flow_version: '1',
  machine_id: demoFlow.machine_id,
  screen_id: 'start',
  step_id: 's1',
} as const;
const active = (stepId = 's1'): AppState => ({ ...initialState, screen: 'active', flow: demoFlow, stepId });
const photograph = (s: AppState) => reducer(s, { type: 'PHOTO', revision: s.revision });
const press = (s: AppState) => reducer(s, { type: 'PRESS', revision: s.revision });
describe('guarded user flow', () => {
  it('starts capture and ignores capture elsewhere', () => {
    expect(reducer(initialState, { type: 'START' }).screen).toBe('capture');
    expect(photograph(initialState)).toEqual(initialState);
  });
  it('accepts a validated identification once', () => {
    const s = photograph(reducer(initialState, { type: 'START' }));
    const a = { type: 'RESULT' as const, requestId: s.requestId, result, flow: demoFlow };
    const done = reducer(s, a);
    expect(done.stepId).toBe('s1');
    expect(reducer(done, a)).toEqual(done);
  });
  it('rejects a mismatched machine', () => {
    const s = photograph(reducer(initialState, { type: 'START' }));
    expect(
      reducer(s, {
        type: 'RESULT',
        requestId: s.requestId,
        result: { ...result, machine_id: 'other' },
        flow: demoFlow,
      }).error,
    ).toBe('protocol');
  });
  it('rejects stale response after cancel/restart', () => {
    const s = photograph(reducer(initialState, { type: 'START' }));
    for (const type of ['CANCEL', 'RESTART'] as const) {
      const stopped = reducer(s, { type });
      expect(reducer(stopped, { type: 'RESULT', requestId: s.requestId, result, flow: demoFlow })).toEqual(
        stopped,
      );
    }
  });
  it('hands two unknown results to staff', () => {
    let s = reducer(initialState, { type: 'START' });
    for (let i = 0; i < 2; i++) {
      s = photograph(s);
      s = reducer(s, { type: 'UNKNOWN', requestId: s.requestId });
    }
    expect(s.screen).toBe('staff');
  });
  it('does not count transport failures as unknown', () => {
    let s = photograph(reducer(initialState, { type: 'START' }));
    s = reducer(s, { type: 'ERROR', requestId: s.requestId, error: 'offline' });
    expect(s.unknownCount).toBe(0);
    expect(s.error).toBe('offline');
  });
  it('blocks repeat action from previous screen revision', () => {
    const old = active();
    const next = press(old);
    expect(reducer(next, { type: 'PRESS', revision: old.revision })).toEqual(next);
  });
  it('does not advance behind help or on staff screen', () => {
    for (const s of [
      { ...active(), overlay: 'help' as const },
      { ...active(), screen: 'staff' as const },
    ])
      expect(press(s)).toEqual(s);
  });
  it('does not advance a choice without confirmation', () => {
    const s = active('s2');
    expect(press(s)).toEqual(s);
    expect(reducer(s, { type: 'CONFIRM', revision: 0 })).toEqual(s);
    expect(reducer(s, { type: 'SELECT', optionId: 'missing', revision: 0 })).toEqual(s);
  });
  it.each(['internal', 'surgery', 'orthopedics'])(
    'completes %s with explicit safety confirmation',
    (optionId) => {
      let s = press(active());
      s = reducer(s, { type: 'SELECT', optionId, revision: s.revision });
      expect(s.stepId).toBe('s2');
      s = reducer(s, { type: 'CONFIRM', revision: s.revision });
      expect(s.stepId).toBe(`s3-${optionId}`);
      s = press(s);
      expect(s.stepId).toBe('s4');
      expect(s.overlay).toBe('safety');
      const closed = reducer(s, { type: 'CLOSE' });
      expect(reducer(closed, { type: 'RESUME', revision: closed.revision })).toEqual(closed);
      expect(press(closed).stepId).toBe('s4');
      s = reducer(s, { type: 'RESUME', revision: s.revision });
      expect(s.stepId).toBe('s5');
      s = press(s);
      expect(s.stepId).toBe('s6');
      expect(press(s)).toEqual(s);
    },
  );
  it('never resumes a nonresumable stop', () => {
    const flow = structuredClone(demoFlow);
    const step = flow.steps.s4;
    if (step?.type === 'stop') step.resumable = false;
    const s = { ...active('s4'), flow, overlay: 'safety' as const };
    expect(reducer(s, { type: 'RESUME', revision: 0 })).toEqual(s);
  });
  it('restores selection and step after retake cancel', () => {
    const s = { ...active('s2'), selected: 'surgery' };
    const capture = reducer(s, { type: 'RETAKE' });
    const back = reducer(photograph(capture), { type: 'CANCEL' });
    expect(back.screen).toBe('active');
    expect(back.stepId).toBe('s2');
    expect(back.selected).toBe('surgery');
  });
  it('does not allow a sensitive step to retake', () => {
    const s = active('s4');
    expect(reducer(s, { type: 'RETAKE' })).toEqual(s);
  });
  it('staff return preserves pending stop', () => {
    const s = reducer(active('s4'), { type: 'STAFF' });
    expect(reducer(s, { type: 'RETURN' }).overlay).toBe('safety');
  });
  it('restarts without flow or old selections', () => {
    const s = reducer({ ...active('s3-internal'), selected: 'internal' }, { type: 'RESTART' });
    expect(s.flow).toBeNull();
    expect(s.selected).toBeNull();
  });
  it('honors a future Retry-After', () => {
    const s = { ...initialState, screen: 'capture' as const, retryAt: Date.now() + 60000 };
    expect(photograph(s)).toEqual(s);
  });
});

it('rejects a server flow that skips the reviewed safety stop', () => {
  const s = photograph(reducer(initialState, { type: 'START' }));
  const flow = structuredClone(demoFlow);
  const step = flow.steps['s3-internal'];
  if (step?.type === 'guide') step.next = 's5';
  expect(reducer(s, { type: 'RESULT', requestId: s.requestId, result, flow }).error).toBe('protocol');
});
describe('going back one step', () => {
  const back = (s: AppState) => reducer(s, { type: 'BACK', revision: s.revision });
  it('returns to the previous step with a new revision', () => {
    const next = press(active('s1'));
    expect(next.stepId).toBe('s2');
    const returned = back(next);
    expect(returned.stepId).toBe('s1');
    expect(returned.revision).toBeGreaterThan(next.revision);
    expect(returned.trail).toEqual([]);
  });
  it('does nothing at the first step', () => {
    const start = active('s1');
    expect(back(start)).toEqual(start);
  });
  it('ignores a stale revision', () => {
    const next = press(active('s1'));
    expect(reducer(next, { type: 'BACK', revision: next.revision - 1 })).toEqual(next);
  });
  it('shows the personal-information stop again and still needs confirmation', () => {
    const atStop: AppState = { ...active('s4'), trail: ['s3-internal'], overlay: 'safety' };
    const atConfirm = reducer(atStop, { type: 'RESUME', revision: atStop.revision });
    expect(atConfirm.stepId).toBe('s5');
    const returned = back(atConfirm);
    expect(returned.stepId).toBe('s4');
    expect(returned.overlay).toBe('safety');
    expect(press({ ...returned, overlay: null }).stepId).toBe('s4');
  });
});
describe('rejected photos', () => {
  const identifying = () => photograph(reducer(initialState, { type: 'START' }));
  it('keeps the reason for the staff screen', () => {
    const s = identifying();
    const staff = reducer(s, { type: 'REJECTED', requestId: s.requestId, reason: 'sensitive' });
    expect([staff.screen, staff.rejected]).toEqual(['staff', 'sensitive']);
  });
  it('clears the reason when the user restarts or asks for staff directly', () => {
    const s = identifying();
    const staff = reducer(s, { type: 'REJECTED', requestId: s.requestId, reason: 'unsupported' });
    expect(reducer(staff, { type: 'RESTART' }).rejected).toBeNull();
    expect(reducer(staff, { type: 'STAFF' }).rejected).toBeNull();
    expect(reducer(staff, { type: 'RETURN' }).rejected).toBeNull();
  });
});
