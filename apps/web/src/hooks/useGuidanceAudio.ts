import { useCallback, useEffect, useRef, useState } from 'react';
import { guidanceElement, isGuidanceAudioPrimed, japaneseVoice } from '../audio/unlock';
const AUTO_DELAY = 250;
/**
 * One owned player per screen. Reviewed prerecorded files may be supplied through src;
 * otherwise (or if the file fails) the device's own Japanese voice is used. No remote speech service.
 * `auto` speaks once when the screen mounts, but only after the start tap primed audio.
 * A blocked auto start stays silent and leaves the play button; a user-started failure is reported.
 */
export function useGuidanceAudio(key: string, text: string, src?: string, auto = false) {
  const [playing, setPlaying] = useState(false),
    [failed, setFailed] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null),
    utterance = useRef<SpeechSynthesisUtterance | null>(null),
    seq = useRef(0),
    active = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = useCallback(() => {
    seq.current++;
    active.current = false;
    if (timer.current) clearTimeout(timer.current);
    if (autoTimer.current) clearTimeout(autoTimer.current);
    timer.current = autoTimer.current = null;
    if (audio.current) {
      const player = audio.current;
      audio.current = null;
      player.onended = null;
      player.onerror = null;
      player.pause();
      player.removeAttribute('src');
      player.load();
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
  const play = async (mode: 'user' | 'auto' = 'user') => {
    if (mode === 'user' && active.current) {
      stop();
      return;
    }
    stop();
    setFailed(false);
    if (!text && !src) return;
    active.current = true;
    const id = seq.current;
    const finish = (error = false) => {
      if (seq.current !== id) return;
      stop();
      setFailed(error);
    };
    const begin = () => {
      if (seq.current === id) setPlaying(true);
    };
    timer.current = setTimeout(() => finish(mode === 'user'), 30000);
    const speak = async () => {
      const voice = await japaneseVoice();
      if (seq.current !== id) return;
      if (!voice || !text) {
        finish(mode === 'user');
        return;
      }
      const speech = new SpeechSynthesisUtterance(text);
      utterance.current = speech;
      speech.lang = 'ja-JP';
      speech.voice = voice;
      speech.onstart = begin;
      speech.onend = () => finish();
      speech.onerror = (e) => finish(mode === 'user' || e.error !== 'not-allowed');
      window.speechSynthesis.speak(speech);
    };
    if (!src) {
      await speak();
      return;
    }
    const player = guidanceElement();
    audio.current = player;
    const fallback = () => {
      if (seq.current !== id || audio.current !== player) return;
      player.onended = null;
      player.onerror = null;
      player.pause();
      player.removeAttribute('src');
      player.load();
      audio.current = null;
      void speak();
    };
    player.onended = () => finish();
    player.onerror = fallback;
    player.src = src;
    try {
      await player.play();
      begin();
    } catch (error) {
      if (seq.current !== id) return;
      // Blocked playback would also block speech; don't retry silently.
      if (error instanceof DOMException && error.name === 'NotAllowedError') finish(mode === 'user');
      else fallback();
    }
  };
  const playRef = useRef(play);
  playRef.current = play;
  useEffect(() => {
    if (!auto || !isGuidanceAudioPrimed()) return;
    autoTimer.current = setTimeout(() => {
      autoTimer.current = null;
      void playRef.current('auto');
    }, AUTO_DELAY);
    return () => {
      if (autoTimer.current) clearTimeout(autoTimer.current);
      autoTimer.current = null;
    };
    // Mount only: closing a sheet or selecting an option must not replay the step.
  }, []);
  return { playing, failed, play: () => play('user'), stop };
}
