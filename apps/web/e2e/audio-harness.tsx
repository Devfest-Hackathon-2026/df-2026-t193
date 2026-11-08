// Browser-only test harness; not imported by the application bundle.
import { createRoot } from 'react-dom/client';
import { createElement, useState } from 'react';
import { useGuidanceAudio } from '../src/hooks/useGuidanceAudio';
export function mount() {
  const element = document.createElement('div');
  element.id = 'audio-test';
  document.body.append(element);
  function Harness() {
    const [step, setStep] = useState(1);
    const audio = useGuidanceAudio(String(step), 'テスト', '/fixture-audio.wav');
    return (
      <>
        <button id="play-test" onClick={() => void audio.play()}>
          Play
        </button>
        <button id="next-test" onClick={() => setStep((n) => n + 1)}>
          Next
        </button>
        <output id="audio-state">{audio.failed ? 'failed' : audio.playing ? 'playing' : 'idle'}</output>
      </>
    );
  }
  createRoot(element).render(createElement(Harness));
}
