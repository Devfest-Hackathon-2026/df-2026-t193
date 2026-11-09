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
// Number pad of the input screen: [label, x, y, width] in scene units.
const KEYS: [string, number, number, number][] = [
  ...Array.from({ length: 9 }, (_, i): [string, number, number, number] => [
    String(i + 1),
    70 + (i % 3) * 52,
    178 + Math.floor(i / 3) * 32,
    46,
  ]),
  ['0', 70, 274, 98],
];
export function HospitalKiosk() {
  const [screen, setScreen] = useState<'start' | 'department' | 'input' | 'confirmation' | 'finished'>(
    'start',
  );
  // Only the count of pressed keys is kept, so no number is ever stored or shown.
  const [digits, setDigits] = useState(0);
  const go = (next: typeof screen) => {
    setDigits(0);
    setScreen(next);
  };
  const c = ja.kiosk,
    choice = demoFlow.steps.s2;
  if (choice?.type !== 'choice') return null;
  const name =
    screen === 'department'
      ? 'terminal-choices'
      : screen === 'input'
        ? 'terminal-input'
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
        <>
          <svg className="kiosk-image" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} aria-hidden="true">
            <image href={asset(name)} width="400" height="450" />
          </svg>
          <h1 className="sr">
            {screen === 'start'
              ? c.start
              : screen === 'department'
                ? c.select
                : screen === 'input'
                  ? c.input
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
                onClick={() => go('input')}
              >
                {o.label}
              </button>
            ))}
          {screen === 'start' && (
            <>
              <button
                className="kiosk-hit kiosk-return"
                style={box(68, 260, 77, 38)}
                onClick={() => go('start')}
              >
                もどる
              </button>
              <button className="kiosk-hit" style={box(232, 244, 108, 60)} onClick={() => go('department')}>
                {c.receipt}
              </button>
            </>
          )}
          {screen === 'input' && (
            <>
              <span className="kiosk-field" style={box(70, 136, 150, 34)} aria-label={c.entered(digits)}>
                {'●'.repeat(digits)}
              </span>
              {KEYS.map(([key, x, y, w]) => (
                <button
                  className="kiosk-hit kiosk-key"
                  style={box(x, y, w, 28)}
                  key={key}
                  onClick={() => setDigits((n) => Math.min(n + 1, 8))}
                >
                  {key}
                </button>
              ))}
              <button
                className="kiosk-hit kiosk-key kiosk-clear"
                style={box(174, 274, 46, 28)}
                onClick={() => setDigits(0)}
              >
                {c.clear}
              </button>
              <button
                className="kiosk-hit"
                style={box(232, 244, 108, 60)}
                disabled={digits === 0}
                onClick={() => go('confirmation')}
              >
                {c.next}
              </button>
            </>
          )}
          {screen === 'confirmation' && (
            <button className="kiosk-hit" style={box(232, 244, 108, 60)} onClick={() => go('finished')}>
              {c.confirmation}
            </button>
          )}
        </>
      </section>
      <footer>
        <button className="kiosk-back" onClick={() => go('start')}>
          {c.reset}
        </button>
      </footer>
    </main>
  );
}
