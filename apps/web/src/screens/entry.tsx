import { useEffect, useState } from 'react';
import { ja } from '../copy/ja';
import { Header, Heading, Word, Primary, Help, Voice } from '../components/ui';
import { KioskScene } from '../components/KioskScene';
import { useCamera } from '../hooks/useCamera';
import { primeGuidanceAudio } from '../audio/unlock';
import { useAutoVoice } from '../audio/preference';
import { useGuidanceAudio } from '../hooks/useGuidanceAudio';
import { voiceFile } from '../content/voice';
import type { AppState } from '../state/machine';
export function StartScreen({
  demo,
  onStart,
  onHelp,
}: {
  demo: boolean;
  onStart: () => void;
  onHelp: () => void;
}) {
  return (
    <main className="app view-start">
      <Header demo={demo} />
      <KioskScene name="terminal-start" />
      <section className="guide-panel" aria-labelledby="instruction">
        <Heading>
          <Word>押す</Word>
          <Word>ボタンを</Word>
          <Word>
            <strong>声で案内</strong>
          </Word>
        </Heading>
        <p className="subcopy">{ja.startCopy}</p>
        <Primary onClick={onStart}>{ja.start}</Primary>
        <Help onClick={onHelp} label={ja.howto} />
      </section>
    </main>
  );
}
/** Remounts per phase so each new instruction is spoken once; a sheet only stops it. */
function CaptureVoice({ text, overlay }: { text: string; overlay: AppState['overlay'] }) {
  const autoVoice = useAutoVoice();
  useGuidanceAudio(`capture:${overlay}`, text, voiceFile(null, text), autoVoice);
  return null;
}
export function CaptureScreen({
  demo,
  state,
  onPhoto,
  onCancel,
  onHelp,
}: {
  demo: boolean;
  state: AppState;
  onPhoto: (image: Blob | null, screen: string) => void;
  onCancel: () => void;
  onHelp: () => void;
}) {
  const camera = useCamera(!demo),
    [screen, setScreen] = useState(
      state.stepId === 's5' ? 'confirmation' : state.stepId && state.stepId !== 's1' ? 'department' : 'start',
    );
  const [wait, setWait] = useState(Date.now() < state.retryAt);
  const captureError = !demo ? camera.error : null;
  const phase = captureError
    ? `camera-${captureError}`
    : state.error
      ? 'error'
      : demo
        ? 'demo'
        : camera.status === 'waiting'
          ? 'allow'
          : camera.status === 'paused'
            ? 'paused'
            : 'ready';
  const spoken = captureError
    ? ja.cameraErrors[captureError]
    : state.error
      ? ja.errors[state.error]
      : phase === 'demo'
        ? ja.speech.demoCapture
        : phase === 'allow'
          ? ja.speech.cameraAllow
          : phase === 'ready'
            ? ja.speech.capture
            : '';
  useEffect(() => {
    const timer = setTimeout(
      () => setWait(false),
      Math.max(0, Math.min(state.retryAt - Date.now(), 2147483647)),
    );
    return () => clearTimeout(timer);
  }, [state.retryAt]);
  const scene =
    screen === 'department'
      ? 'terminal-choices'
      : screen === 'confirmation'
        ? 'terminal-confirm-neutral'
        : screen === 'finished'
          ? 'terminal-done'
          : 'terminal-neutral';
  async function take() {
    primeGuidanceAudio();
    if (demo) {
      onPhoto(null, screen);
      return;
    }
    const blob = await camera.capture();
    if (blob) onPhoto(blob, screen);
  }
  return (
    <main className="app view-capture">
      <CaptureVoice key={phase} text={spoken} overlay={state.overlay} />
      <Header demo={demo} camera back={onCancel} />
      {demo ? (
        <KioskScene name={scene}>
          <div className="capture-frame demo-frame" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
        </KioskScene>
      ) : (
        <figure className="world live-camera">
          <video
            ref={camera.video}
            muted
            playsInline
            onLoadedData={camera.ready}
            onPlaying={camera.ready}
            aria-label="カメラの映像"
          />
          <div className="camera-border" aria-hidden="true" />
        </figure>
      )}
      <section className="guide-panel" aria-labelledby="instruction">
        <Heading>
          <Word>
            <strong>画面</strong>を
          </Word>
          <Word>映して</Word>
          <Word>ください</Word>
        </Heading>
        {demo && <p className="subcopy">{ja.demoCapture}</p>}
        {state.error && (
          <p className="feedback" role="alert">
            {ja.errors[state.error]}
          </p>
        )}
        {!demo && (
          <>
            <p className="camera-notice">{ja.privacy}</p>
            {camera.status === 'waiting' && (
              <p className="feedback" role="status">
                {ja.cameraWaiting}
              </p>
            )}
            {camera.error && (
              <p className="feedback" role="alert">
                {ja.cameraErrors[camera.error]}
              </p>
            )}
            {(camera.status === 'error' || camera.status === 'paused') && (
              <button className="option" onClick={camera.retry}>
                {ja.retry}
              </button>
            )}
          </>
        )}
        {state.error === 'unconfigured' && (
          <a className="option demo-link" href="/demo">
            {ja.demoLink}
          </a>
        )}
        {demo && state.returnTo === 'active' && (
          <label className="demo-select">
            {ja.demoScreen}
            <select value={screen} onChange={(e) => setScreen(e.target.value)}>
              {ja.demoChoices.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        <Primary onClick={() => void take()} disabled={wait || (!demo && camera.status !== 'ready')}>
          {ja.take}
        </Primary>
        <Help onClick={onHelp} />
      </section>
    </main>
  );
}
export function IdentifyingScreen({ demo, onCancel }: { demo: boolean; onCancel: () => void }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <main className="app view-start">
      <Header demo={demo} />
      <KioskScene name="terminal-neutral" />
      <section className="guide-panel">
        <Heading>{ja.checking}</Heading>
        <div className="loading-bar" role="status" aria-label={ja.checking} />
        {slow && (
          <p className="feedback" role="status">
            {ja.checkingSlow}
          </p>
        )}
        <Help onClick={onCancel} label={ja.cancel} icon="back" />
      </section>
    </main>
  );
}
export function StaffScreen({
  demo,
  canReturn,
  reason,
  onBack,
  onRestart,
}: {
  demo: boolean;
  canReturn: boolean;
  reason: AppState['rejected'];
  onBack: () => void;
  onRestart: () => void;
}) {
  const autoVoice = useAutoVoice();
  const reasonText = reason ? ja.rejected[reason] : '';
  const reasonAudio = useGuidanceAudio('reason', reasonText, voiceFile(null, reasonText), autoVoice);
  // Not automatic: the user decides when the phone speaks to staff.
  const audio = useGuidanceAudio('staff', ja.staffMessage, voiceFile(null, ja.staffMessage));
  return (
    <main className="app view-start view-staff">
      <Header demo={demo} />
      {reason ? <div className="world" /> : <KioskScene name="terminal-neutral" />}
      <section className="guide-panel">
        <Heading>
          {ja.staffTitleWords.map((w) => (
            <Word key={w}>{w}</Word>
          ))}
        </Heading>
        {reason && <p className="subcopy">{reasonText}</p>}
        <p className="staff-message">{ja.staffMessage}</p>
        <Voice
          playing={audio.playing}
          failed={audio.failed}
          onClick={() => {
            reasonAudio.stop();
            void audio.play();
          }}
          label={ja.staffVoice}
        />
        <Primary onClick={canReturn ? onBack : onRestart}>{canReturn ? ja.return : ja.restart}</Primary>
        {canReturn && <Help onClick={onRestart} label={ja.restart} icon="back" />}
      </section>
    </main>
  );
}
