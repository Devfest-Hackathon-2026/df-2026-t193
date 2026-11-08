/**
 * One shared media element for guidance audio.
 * Mobile browsers only let a page play sound after a user gesture. iOS Safari unlocks
 * per element, so the same element is played once inside the start tap and then reused
 * for every later step that the user reaches by tapping on the phone.
 */
// 50 ms of 8-bit mono 8 kHz silence (0x80 is the zero level for unsigned 8-bit PCM).
const SILENT = (() => {
  const samples = 400,
    u32 = (n: number) => String.fromCharCode(n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24),
    u16 = (n: number) => String.fromCharCode(n & 255, n >> 8);
  const wav =
    'RIFF' +
    u32(36 + samples) +
    'WAVEfmt ' +
    u32(16) +
    u16(1) +
    u16(1) +
    u32(8000) +
    u32(8000) +
    u16(1) +
    u16(8) +
    'data' +
    u32(samples) +
    '\x80'.repeat(samples);
  return `data:audio/wav;base64,${btoa(wav)}`;
})();
let element: HTMLAudioElement | null = null;
let primed = false;

export function guidanceElement() {
  element ??= new Audio();
  return element;
}

export const isGuidanceAudioPrimed = () => primed;

/** Call synchronously inside a user tap. Safe to call more than once. */
export function primeGuidanceAudio() {
  if (primed) return;
  primed = true;
  try {
    const player = guidanceElement();
    player.src = SILENT;
    const started = player.play();
    void Promise.resolve(started)
      .then(() => {
        if (player.src === SILENT) player.pause();
      })
      .catch(() => {});
  } catch {
    // An unsupported element only means guidance falls back to the play button.
  }
  try {
    const synth = window.speechSynthesis;
    if (synth?.speak) {
      const silent = new SpeechSynthesisUtterance('');
      silent.volume = 0;
      synth.speak(silent);
    }
  } catch {
    // Same as above: no device speech, touch guidance remains.
  }
}

/** Japanese on-device voice only. Voices load asynchronously in Chrome, so wait briefly. */
export function japaneseVoice(timeout = 1500): Promise<SpeechSynthesisVoice | null> {
  const synth = window.speechSynthesis;
  if (!synth?.getVoices) return Promise.resolve(null);
  const pick = () => bestJapaneseVoice(synth.getVoices());
  const found = pick();
  if (found || synth.getVoices().length || !synth.addEventListener) return Promise.resolve(found);
  return new Promise((resolve) => {
    const done = () => {
      synth.removeEventListener('voiceschanged', done);
      clearTimeout(timer);
      resolve(pick());
    };
    const timer = setTimeout(done, timeout);
    synth.addEventListener('voiceschanged', done);
  });
}

// Apple's novelty/Eloquence voices sound robotic; never pick them for guidance.
const NOVELTY =
  /^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley|Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox)\b/i;
const score = (v: SpeechSynthesisVoice) => {
  if (/premium|enhanced|拡張|高品質/i.test(v.name)) return 4;
  if (/^(Kyoko|O-ren|Otoya|Hattori)\b/i.test(v.name)) return 3;
  if (/google|android|ja-jp-x-/i.test(v.name + v.voiceURI)) return 2;
  return 1;
};
/** On-device Japanese voices only, natural ones first. */
export function bestJapaneseVoice(voices: SpeechSynthesisVoice[]) {
  return (
    voices
      .filter((v) => /^ja[-_]/i.test(v.lang) && v.localService && !NOVELTY.test(v.name))
      .sort((a, b) => score(b) - score(a))[0] ?? null
  );
}

/** Test-only reset. */
export function resetGuidanceAudioForTest() {
  element = null;
  primed = false;
}
