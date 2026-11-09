import { useState } from 'react';
import { ja } from '../copy/ja';
import { demoFlow } from '../api/demo';
import { asset } from '../content/hospital-scenes';
// Crop of the 400×450 scene, with some bezel around the kiosk screen.
const VIEW = { x: 46, y: 45, w: 304, h: 276 };
const box = (x: number, y: number, w: number, h: number) => ({
  left: `${((x - VIEW.x) / VIEW.w) * 100}%`,
  top: `${((y - VIEW.y) / VIEW.h) * 100}%`,
  width: `${(w / VIEW.w) * 100}%`,
  height: `${(h / VIEW.h) * 100}%`,
});
export function HospitalKiosk() {
  const [screen, setScreen] = useState<'start' | 'department' | 'input' | 'confirmation' | 'finished'>(
    'start',
  );
  const c = ja.kiosk,
    choice = demoFlow.steps.s2;
  if (choice?.type !== 'choice') return null;
  const name =
    screen === 'department'
      ? 'terminal-choices'
      : screen === 'confirmation'
        ? 'terminal-confirm-neutral'
        : screen === 'finished'
          ? 'terminal-done'
          : 'terminal-neutral';
  return (
    <main className="mock-kiosk">
      <header>
        <span>{c.badge}</span>
      </header>
      <section className="kiosk-display" aria-label={c.title}>
        {screen === 'input' ? (
          <div className="kiosk-safe">
            <h1>{c.input}</h1>
            <p>{c.inputNote}</p>
            <button onClick={() => setScreen('confirmation')}>{c.inputAction}</button>
          </div>
        ) : (
          <>
            <svg
              className="kiosk-image"
              viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
              aria-hidden="true"
            >
              <image href={asset(name)} width="400" height="450" />
            </svg>
            <h1 className="sr">
              {screen === 'start'
                ? c.start
                : screen === 'department'
                  ? c.select
                  : screen === 'confirmation'
                    ? c.confirm
                    : c.done}
            </h1>
            {screen === 'department' &&
              choice.options.map((o, i) => (
                <button
                  className="kiosk-hit dept-hit"
                  style={box(68 + i * 92, 132, 77, 58)}
                  key={o.id}
                  onClick={() => setScreen('input')}
                >
                  {o.label}
                </button>
              ))}
            {screen === 'start' && (
              <>
                <button
                  className="kiosk-hit kiosk-return"
                  style={box(68, 260, 77, 38)}
                  onClick={() => setScreen('start')}
                >
                  もどる
                </button>
                <button
                  className="kiosk-hit"
                  style={box(232, 244, 108, 60)}
                  onClick={() => setScreen('department')}
                >
                  {c.receipt}
                </button>
              </>
            )}
            {screen === 'confirmation' && (
              <button
                className="kiosk-hit"
                style={box(232, 244, 108, 60)}
                onClick={() => setScreen('finished')}
              >
                {c.confirmation}
              </button>
            )}
          </>
        )}
      </section>
      <footer>
        <button className="kiosk-back" onClick={() => setScreen('start')}>
          {c.reset}
        </button>
      </footer>
    </main>
  );
}
