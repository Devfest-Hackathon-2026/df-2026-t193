import { useEffect, useReducer, useRef } from 'react';
import { validateIdentification } from '@tonari/shared';
import { reducer, initialState, currentStep } from './state/machine';
import { StartScreen, CaptureScreen, IdentifyingScreen, StaffScreen } from './screens/entry';
import { GuidanceScreen } from './screens/guidance';
import { Sheet } from './components/ui';
import { ja } from './copy/ja';
import { demoFlow, demoIdentify } from './api/demo';
import { createHttpGateway } from './api/http';
import { GatewayError } from './api/gateway';
import { asset, assertSupportedScenes, scenes } from './content/hospital-scenes';
import { HospitalKiosk } from './mock/HospitalKiosk';
import { primeGuidanceAudio } from './audio/unlock';
import { setAutoVoice, useAutoVoice } from './audio/preference';
import { useScreenWake } from './hooks/useScreenWake';
const gateway = createHttpGateway(import.meta.env.VITE_API_BASE_URL ?? '');
export function App() {
  return location.pathname === '/mock/hospital' ? <HospitalKiosk /> : <GuideApp />;
}
function GuideApp() {
  const demo = location.pathname === '/demo';
  const [state, dispatch] = useReducer(reducer, initialState);
  const pending = useRef<{ image: Blob | null; screen: string } | null>(null);
  const latest = useRef(state);
  latest.current = state;
  useScreenWake(state.screen !== 'start' && currentStep(state)?.type !== 'end');
  useEffect(() => {
    if (!state.flow) return;
    // Every step's picture is ready before the user reaches it.
    for (const { name } of Object.values(scenes)) new Image().src = asset(name);
  }, [state.flow]);
  useEffect(() => {
    if (state.screen !== 'identifying') return;
    const input = pending.current;
    if (!input) return;
    const controller = new AbortController();
    const requestId = state.requestId;
    const run = async () => {
      try {
        if (demo) {
          const result = await demoIdentify(input.screen, controller.signal);
          if (controller.signal.aborted) return;
          if (result.status === 'ok') dispatch({ type: 'RESULT', requestId, result, flow: demoFlow });
          else dispatch({ type: 'UNKNOWN', requestId });
        } else {
          const session = await gateway.createSession(controller.signal);
          if (!input.image) throw new GatewayError('protocol');
          const result = await gateway.identify(input.image, session, controller.signal);
          input.image = null;
          if (controller.signal.aborted) return;
          if (result.status === 'ok') {
            const data = await gateway.getFlow(
              result.flow_id,
              result.flow_version,
              session,
              controller.signal,
            );
            const flow = validateIdentification(result, data);
            assertSupportedScenes(flow);
            if (!controller.signal.aborted) dispatch({ type: 'RESULT', requestId, result, flow });
          } else if (result.status === 'unknown') dispatch({ type: 'UNKNOWN', requestId });
          else dispatch({ type: 'REJECTED', requestId, reason: result.status });
        }
      } catch (error) {
        if (!controller.signal.aborted)
          dispatch({
            type: 'ERROR',
            requestId,
            error: error instanceof GatewayError ? error.kind : 'protocol',
            retryAt: error instanceof GatewayError ? error.retryAt : 0,
          });
      } finally {
        if (!controller.signal.aborted) {
          input.image = null;
          if (pending.current === input) pending.current = null;
        }
      }
    };
    void run();
    const hidden = () => {
      if (document.hidden) {
        input.image = null;
        controller.abort();
        pending.current = null;
        dispatch({ type: 'CANCEL' });
      }
    };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      controller.abort();
      input.image = null;
      if (pending.current === input) pending.current = null;
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [state.screen, state.requestId, demo]);
  useEffect(() => {
    if (state.screen !== 'identifying') {
      if (pending.current) pending.current.image = null;
      pending.current = null;
    }
  }, [state.screen]);
  useEffect(() => {
    // A single same-document entry lets browser Back cancel an overlay/capture without inventing kiosk history.
    if (!history.state?.tonari) history.pushState({ tonari: true }, '', location.href);
    const back = () => {
      const s = latest.current;
      if (s.screen === 'start' && !s.overlay) {
        history.back();
        return;
      }
      if (s.overlay) dispatch({ type: 'CLOSE' });
      else if (s.screen === 'capture' || s.screen === 'identifying') dispatch({ type: 'CANCEL' });
      else if (s.screen === 'active' && currentStep(s)?.type !== 'end') {
        // Back undoes one mistaken tap instead of discarding the whole guidance.
        if (s.trail.length > 0) dispatch({ type: 'BACK', revision: s.revision });
        else dispatch({ type: 'RETAKE' });
      } else if (s.screen === 'staff' && s.flow && s.stepId) dispatch({ type: 'RETURN' });
      else dispatch({ type: 'RESTART' });
      history.pushState({ tonari: true }, '', location.href);
    };
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  const close = () => dispatch({ type: 'CLOSE' }),
    help = () => dispatch({ type: 'OPEN', overlay: 'help' });
  return (
    <>
      {state.screen === 'start' && (
        <StartScreen
          demo={demo}
          onStart={() => {
            primeGuidanceAudio();
            dispatch({ type: 'START' });
          }}
          onHelp={() => dispatch({ type: 'OPEN', overlay: 'howto' })}
        />
      )}
      {state.screen === 'capture' && (
        <CaptureScreen
          key={state.revision}
          demo={demo}
          state={state}
          onPhoto={(image, screen) => {
            pending.current = { image, screen };
            dispatch({ type: 'PHOTO', revision: state.revision });
          }}
          onCancel={() => dispatch({ type: 'CANCEL' })}
          onHelp={help}
        />
      )}
      {state.screen === 'identifying' && (
        <IdentifyingScreen demo={demo} onCancel={() => dispatch({ type: 'CANCEL' })} />
      )}
      {state.screen === 'active' && (
        <GuidanceScreen key={state.revision} demo={demo} state={state} dispatch={dispatch} />
      )}
      {state.screen === 'staff' && (
        <StaffScreen
          demo={demo}
          canReturn={Boolean(state.flow && state.stepId)}
          reason={state.rejected}
          onBack={() => dispatch({ type: 'RETURN' })}
          onRestart={() => dispatch({ type: 'RESTART' })}
        />
      )}
      {state.overlay === 'help' && (
        <Sheet title={ja.helpTitle} onClose={close}>
          {state.screen === 'active' && state.trail.length > 0 && (
            <button className="option" onClick={() => dispatch({ type: 'BACK', revision: state.revision })}>
              {ja.previous}
            </button>
          )}
          {state.screen === 'active' && currentStep(state)?.type !== 'stop' && (
            <button className="option" onClick={() => dispatch({ type: 'RETAKE' })}>
              {ja.wrong}
            </button>
          )}
          <button className="option" onClick={() => dispatch({ type: 'STAFF' })}>
            {ja.staffAction}
          </button>
          <AutoVoiceToggle className="option auto-voice-help" />
          <button className="close" onClick={close}>
            {ja.return}
          </button>
        </Sheet>
      )}
      {state.overlay === 'howto' && (
        <Sheet title={ja.howto} onClose={close}>
          <ol className="howto-list">
            {ja.howtoSteps.map((s, i) => (
              <li key={s}>
                <b>{i + 1}</b>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <AutoVoiceToggle />
          <button className="close" onClick={close}>
            {ja.close}
          </button>
        </Sheet>
      )}
    </>
  );
}
function AutoVoiceToggle({ className = 'option' }: { className?: string }) {
  const on = useAutoVoice();
  return (
    <button className={className} onClick={() => setAutoVoice(!on)}>
      {on ? ja.autoVoiceOff : ja.autoVoiceOn}
    </button>
  );
}
