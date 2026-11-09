import { nextStep, selectOption, validateIdentification, type Flow, type Identified } from '@tonari/shared';
import { assertSupportedScenes } from '../content/hospital-scenes';
import type { ErrorKind } from '../api/gateway';
export type Overlay = 'help' | 'zoom' | 'howto' | 'safety' | null;
export interface AppState {
  screen: 'start' | 'capture' | 'identifying' | 'active' | 'staff';
  flow: Flow | null;
  stepId: string | null;
  previousStep: string | null;
  /** Steps reached by the user's own taps, for going back one step. */
  trail: string[];
  selected: string | null;
  revision: number;
  requestId: number;
  unknownCount: number;
  overlay: Overlay;
  /** Why the service declined to guide this photo; shown on the staff screen. */
  rejected: 'sensitive' | 'unsupported' | null;
  error: ErrorKind | 'unknown' | null;
  retryAt: number;
  returnTo: 'start' | 'active';
}
export const initialState: AppState = {
  screen: 'start',
  flow: null,
  stepId: null,
  previousStep: null,
  trail: [],
  selected: null,
  revision: 0,
  requestId: 0,
  unknownCount: 0,
  overlay: null,
  rejected: null,
  error: null,
  retryAt: 0,
  returnTo: 'start',
};
export type Action =
  | { type: 'START' | 'RESTART' | 'RETAKE' | 'CANCEL' | 'STAFF' | 'RETURN' | 'CLOSE' }
  | { type: 'OPEN'; overlay: Overlay }
  | { type: 'PHOTO'; revision: number }
  | { type: 'RESULT'; requestId: number; result: Identified; flow: Flow }
  | { type: 'UNKNOWN'; requestId: number }
  | { type: 'REJECTED'; requestId: number; reason: 'sensitive' | 'unsupported' }
  | { type: 'ERROR'; requestId: number; error: ErrorKind; retryAt?: number }
  | { type: 'SELECT'; optionId: string; revision: number }
  | { type: 'CONFIRM' | 'PRESS' | 'RESUME' | 'BACK'; revision: number };
export function currentStep(state: AppState) {
  return state.flow && state.stepId ? (state.flow.steps[state.stepId] ?? null) : null;
}
export function reducer(state: AppState, action: Action): AppState {
  if ('revision' in action && action.revision !== state.revision) return state;
  if ('requestId' in action && (state.screen !== 'identifying' || action.requestId !== state.requestId))
    return state;
  const step = currentStep(state);
  const move = (next: string): AppState => ({
    ...state,
    stepId: next,
    previousStep: state.stepId,
    trail: state.stepId ? [...state.trail, state.stepId] : state.trail,
    selected: null,
    revision: state.revision + 1,
    overlay: state.flow?.steps[next]?.type === 'stop' ? 'safety' : null,
    error: null,
  });
  switch (action.type) {
    case 'START':
      return state.screen === 'start'
        ? { ...initialState, screen: 'capture', revision: state.revision + 1, requestId: state.requestId + 1 }
        : state;
    case 'RESTART':
      return { ...initialState, revision: state.revision + 1, requestId: state.requestId + 1 };
    case 'PHOTO':
      return state.screen === 'capture' && Date.now() >= state.retryAt
        ? {
            ...state,
            screen: 'identifying',
            requestId: state.requestId + 1,
            revision: state.revision + 1,
            error: null,
            overlay: null,
          }
        : state;
    case 'RESULT': {
      try {
        validateIdentification(action.result, action.flow);
        assertSupportedScenes(action.flow);
      } catch {
        return { ...state, screen: 'capture', error: 'protocol', revision: state.revision + 1 };
      }
      return {
        ...state,
        screen: 'active',
        flow: action.flow,
        stepId: action.result.step_id,
        selected: null,
        previousStep: null,
        trail: [],
        revision: state.revision + 1,
        unknownCount: 0,
        error: null,
        overlay: null,
      };
    }
    case 'UNKNOWN':
      return {
        ...state,
        screen: state.unknownCount + 1 >= 2 ? 'staff' : 'capture',
        rejected: null,
        unknownCount: state.unknownCount + 1,
        error: 'unknown',
        revision: state.revision + 1,
      };
    case 'REJECTED':
      return { ...state, screen: 'staff', rejected: action.reason, revision: state.revision + 1 };
    case 'ERROR':
      return {
        ...state,
        screen: 'capture',
        error: action.error,
        retryAt: action.retryAt ?? 0,
        revision: state.revision + 1,
      };
    case 'SELECT':
      return state.screen === 'active' &&
        step?.type === 'choice' &&
        step.options.some((o) => o.id === action.optionId)
        ? { ...state, selected: action.optionId }
        : state;
    case 'CONFIRM': {
      if (
        state.screen !== 'active' ||
        state.overlay ||
        step?.type !== 'choice' ||
        !state.selected ||
        !state.flow ||
        !state.stepId
      )
        return state;
      const next = selectOption(state.flow, state.stepId, state.selected);
      return next ? move(next) : state;
    }
    case 'PRESS': {
      if (state.screen !== 'active' || state.overlay) return state;
      if (step?.type === 'stop') return { ...state, overlay: 'safety' };
      return step?.type === 'guide' ? move(step.next) : state;
    }
    case 'RESUME': {
      if (
        state.screen !== 'active' ||
        step?.type !== 'stop' ||
        state.overlay !== 'safety' ||
        !step.resumable ||
        !state.flow ||
        !state.stepId
      )
        return state;
      const next = nextStep(state.flow, state.stepId);
      return next ? move(next) : state;
    }
    case 'BACK': {
      const stepId = state.trail.at(-1);
      if (state.screen !== 'active' || !state.flow || !stepId) return state;
      const trail = state.trail.slice(0, -1);
      return {
        ...state,
        stepId,
        trail,
        previousStep: trail.at(-1) ?? null,
        selected: null,
        revision: state.revision + 1,
        // Returning onto a stop shows it again; passing it still needs the explicit confirmation.
        overlay: state.flow.steps[stepId]?.type === 'stop' ? 'safety' : null,
        error: null,
      };
    }
    case 'RETAKE':
      return state.screen === 'active' && step?.type !== 'stop' && step?.type !== 'end'
        ? {
            ...state,
            screen: 'capture',
            returnTo: 'active',
            overlay: null,
            error: null,
            revision: state.revision + 1,
          }
        : state;
    case 'CANCEL':
      return state.screen === 'capture' || state.screen === 'identifying'
        ? {
            ...state,
            screen: state.returnTo,
            requestId: state.requestId + 1,
            revision: state.revision + 1,
            overlay: null,
            error: null,
          }
        : state;
    case 'STAFF':
      return {
        ...state,
        screen: 'staff',
        rejected: null,
        overlay: null,
        revision: state.revision + 1,
        requestId: state.requestId + 1,
      };
    case 'RETURN':
      return {
        ...state,
        screen: state.flow && state.stepId ? 'active' : 'start',
        rejected: null,
        overlay: step?.type === 'stop' ? 'safety' : null,
        revision: state.revision + 1,
        error: null,
      };
    case 'OPEN':
      return { ...state, overlay: action.overlay };
    case 'CLOSE':
      return { ...state, overlay: null };
  }
}
