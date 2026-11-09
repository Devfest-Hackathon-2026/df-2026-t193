import { ja } from '../copy/ja';
import { Header, Heading, Word, Primary, Help, Voice, Sheet, Icon } from '../components/ui';
import { KioskScene, SceneDetail } from '../components/KioskScene';
import type { AppState, Action } from '../state/machine';
import { currentStep } from '../state/machine';
import type { CSSProperties, Dispatch } from 'react';
import { useGuidanceAudio } from '../hooks/useGuidanceAudio';
import { guidanceSpeech } from '../content/speech';
import { voiceFile } from '../content/voice';
import { primeGuidanceAudio } from '../audio/unlock';
import { useAutoVoice } from '../audio/preference';
export function GuidanceScreen({
  state,
  demo,
  dispatch,
}: {
  state: AppState;
  demo: boolean;
  dispatch: Dispatch<Action>;
}) {
  const step = currentStep(state)!;
  const id = step.type === 'stop' ? (state.previousStep ?? 's1') : state.stepId!;
  const visual = state.flow!.steps[id];
  const isChoice = step.type === 'choice',
    isEnd = step.type === 'end';
  const autoVoice = useAutoVoice();
  const text = guidanceSpeech(step, { first: state.previousStep === null });
  const audio = useGuidanceAudio(
    `${state.revision}:${state.overlay}`,
    text,
    voiceFile(state.flow!, text),
    autoVoice,
  );
  const open = (overlay: AppState['overlay']) => {
    audio.stop();
    dispatch({ type: 'OPEN', overlay });
  };
  const press = () => {
    primeGuidanceAudio();
    audio.stop();
    dispatch({ type: isChoice ? 'CONFIRM' : 'PRESS', revision: state.revision });
  };
  const selected = step.type === 'choice' ? step.options.find((o) => o.id === state.selected) : null;
  const label = visual?.type === 'guide' ? visual.target.label : '';
  const keyColor = visual?.type === 'guide' ? visual.target.color : undefined;
  const progress = { current: step.stage + 1, total: state.flow!.stages.length };
  return (
    <>
      <main
        className={`app view-${isChoice ? 'choice' : isEnd ? 'done' : 'guide'}`}
        data-phase={id.startsWith('s3-') ? 'department' : 'reception'}
      >
        <Header demo={demo} progress={progress} />
        <KioskScene
          stepId={isEnd ? state.stepId! : id}
          label={label}
          onZoom={!isChoice && !isEnd ? () => open('zoom') : undefined}
        />
        <section className="guide-panel" aria-labelledby="instruction">
          <Heading>
            {isChoice ? (
              <>
                <Word>
                  <strong>どの科</strong>
                </Word>
                <Word>ですか？</Word>
              </>
            ) : isEnd ? (
              <>
                <Word>案内は</Word>
                <Word>
                  <strong>ここまで</strong>
                </Word>
                <Word>です</Word>
              </>
            ) : (
              <>
                <span className={label.length > 2 ? 'department-line' : undefined}>
                  <Word>
                    <strong
                      className="key"
                      style={keyColor ? ({ '--key': keyColor } as CSSProperties) : undefined}
                    >
                      {label}
                    </strong>
                    を
                  </Word>
                </span>
                <span className={label.length > 2 ? 'department-line' : undefined}>
                  <Word>押して</Word>
                  <Word>ください</Word>
                </span>
              </>
            )}
          </Heading>
          {isChoice && (
            <fieldset className="choices">
              <legend className="sr">{ja.department}</legend>
              {step.options.map((o) => (
                <label className="choice-option" key={o.id}>
                  <span>{o.label}</span>
                  <input
                    className="choice-radio"
                    type="radio"
                    name="department"
                    value={o.id}
                    checked={state.selected === o.id}
                    onChange={() => dispatch({ type: 'SELECT', optionId: o.id, revision: state.revision })}
                  />
                </label>
              ))}
            </fieldset>
          )}
          {isEnd && <p className="subcopy">{ja.thanks}</p>}
          <Primary
            disabled={isChoice && !selected}
            onClick={isEnd ? () => dispatch({ type: 'RESTART' }) : press}
          >
            {isEnd
              ? ja.restart
              : isChoice
                ? selected
                  ? ja.confirm(selected.label)
                  : ja.next
                : step.type === 'stop'
                  ? ja.safetyReview
                  : ja.pressed}
          </Primary>
          {!isEnd && (
            <div className="aids">
              <Voice
                playing={audio.playing}
                failed={audio.failed}
                onClick={() => void audio.play()}
                choice={isChoice}
              />
              <Help onClick={() => open('help')} />
            </div>
          )}
        </section>
      </main>
      {state.overlay === 'zoom' && (
        <Sheet title={`「${label}」です`} onClose={() => dispatch({ type: 'CLOSE' })}>
          <SceneDetail stepId={id} label={label} />
          <button className="close" onClick={() => dispatch({ type: 'CLOSE' })}>
            {ja.return}
          </button>
          <p className="note">{ja.zoomNote}</p>
        </Sheet>
      )}
      {state.overlay === 'safety' && step.type === 'stop' && (
        <Sheet title={ja.safeTitle} onClose={() => dispatch({ type: 'CLOSE' })}>
          <div className="safety-icon">
            <Icon name="shield" />
          </div>
          <p>{step.reason === 'payment' ? ja.paymentStop : ja.safeCopy}</p>
          {step.resumable ? (
            <button className="close" onClick={() => dispatch({ type: 'RESUME', revision: state.revision })}>
              {ja.entered}
            </button>
          ) : (
            <button className="close" onClick={() => dispatch({ type: 'RESTART' })}>
              {ja.restart}
            </button>
          )}
          <button className="safety-secondary" onClick={() => dispatch({ type: 'CLOSE' })}>
            {ja.return}
          </button>
        </Sheet>
      )}
    </>
  );
}
