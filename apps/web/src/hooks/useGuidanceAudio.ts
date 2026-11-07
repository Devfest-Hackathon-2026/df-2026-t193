import { useCallback, useEffect, useRef, useState } from 'react';
/** One owned player. Final prerecorded assets may be supplied through src; no remote speech service fallback. */
export function useGuidanceAudio(key: string, text: string, src?: string) {
  const [playing, setPlaying] = useState(false),
    [failed, setFailed] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null),
    utterance = useRef<SpeechSynthesisUtterance | null>(null),
    seq = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = useCallback(() => {
    seq.current++;
    if (timer.current) clearTimeout(timer.current);
    if (audio.current) {
      audio.current.pause();
      audio.current.removeAttribute('src');
      audio.current.load();
      audio.current = null;
    }
    if (utterance.current) {
      utterance.current.onend = null;
      utterance.current.onerror = null;
      utterance.current.onstart = null;
      window.speechSynthesis?.cancel();
      utterance.current = null;
    }
    setPlaying(false);
  }, []);
  useEffect(() => {
    stop();
    setFailed(false);
    return stop;
  }, [key, stop]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) stop();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', stop);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', stop);
    };
  }, [stop]);
  const play = async () => {
    if (playing) {
      stop();
      return;
    }
    stop();
    setFailed(false);
    const id = seq.current;
    const finish = (error = false) => {
      if (seq.current !== id) return;
      stop();
      setFailed(error);
    };
    timer.current = setTimeout(() => finish(true), 30000);
    if (src) {
      const player = new Audio(src);
      audio.current = player;
      player.onended = () => finish();
      player.onerror = () => finish(true);
      try {
        await player.play();
        if (id === seq.current) setPlaying(true);
        else player.pause();
      } catch {
        finish(true);
      }
      return;
    }
    const synth = window.speechSynthesis;
    const voice = synth?.getVoices().find((v) => /^ja[-_]/i.test(v.lang) && v.localService);
    if (!voice) {
      finish(true);
      return;
    }
    const speech = new SpeechSynthesisUtterance(text);
    utterance.current = speech;
    speech.lang = 'ja-JP';
    speech.voice = voice;
    speech.onstart = () => {
      if (id === seq.current) setPlaying(true);
    };
    speech.onend = () => finish();
    speech.onerror = () => finish(true);
    synth.speak(speech);
  };
  return { playing, failed, play, stop };
}
