import { useCallback, useEffect, useRef, useState } from 'react';
export type CameraError = 'denied' | 'missing' | 'busy' | 'insecure' | 'failed';
export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}
export function cameraError(error: unknown): CameraError {
  const name = error instanceof DOMException ? error.name : '';
  return name === 'NotAllowedError'
    ? 'denied'
    : name === 'NotFoundError'
      ? 'missing'
      : name === 'NotReadableError'
        ? 'busy'
        : 'failed';
}
export function useCamera(enabled: boolean) {
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    generation = useRef(0);
  const [status, setStatus] = useState<'waiting' | 'ready' | 'paused' | 'capturing' | 'error'>('waiting');
  const [error, setError] = useState<CameraError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const stop = useCallback(() => {
    generation.current++;
    stopStream(stream.current);
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const id = ++generation.current;
    setStatus('waiting');
    setError(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('insecure');
      setStatus('error');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(async (acquired) => {
        if (id !== generation.current || document.hidden) {
          stopStream(acquired);
          return;
        }
        stream.current = acquired;
        acquired.getVideoTracks().forEach((track) =>
          track.addEventListener(
            'ended',
            () => {
              if (id !== generation.current) return;
              stop();
              setError('missing');
              setStatus('error');
            },
            { once: true },
          ),
        );
        if (video.current) {
          video.current.srcObject = acquired;
          try {
            await video.current.play();
          } catch {
            if (id === generation.current) {
              stop();
              setError('failed');
              setStatus('error');
            }
          }
        }
      })
      .catch((e) => {
        if (id === generation.current) {
          setError(cameraError(e));
          setStatus('error');
        }
      });
    const pause = () => {
      stop();
      setStatus('paused');
    };
    const visibility = () => {
      if (document.hidden) pause();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pause);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pause);
    };
  }, [enabled, attempt, stop]);
  const ready = () => {
    if (stream.current && video.current?.videoWidth) setStatus('ready');
  };
  async function capture(): Promise<Blob | null> {
    const element = video.current;
    if (status !== 'ready' || !element || !element.videoWidth) return null;
    const id = generation.current;
    setStatus('capturing');
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1280 / Math.max(element.videoWidth, element.videoHeight));
    canvas.width = Math.round(element.videoWidth * scale);
    canvas.height = Math.round(element.videoHeight * scale);
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.drawImage(element, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      if (id !== generation.current) return null;
      stop();
      if (!blob || blob.size > 2 * 1024 * 1024) throw new Error('Capture invalid');
      setStatus('paused');
      return blob;
    } catch {
      if (id === generation.current || generation.current === id + 1) {
        stop();
        setError('failed');
        setStatus('error');
      }
      return null;
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
  return { video, status, error, ready, capture, retry: () => setAttempt((n) => n + 1), stop };
}
