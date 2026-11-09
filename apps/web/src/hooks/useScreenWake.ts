import { useEffect } from 'react';
/** Keeps the phone awake while the user looks at the kiosk. Unsupported browsers simply continue. */
export function useScreenWake(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      if (document.hidden || (lock && !lock.released)) return;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (stopped) void next.release();
        else lock = next;
      } catch {
        // Refused (battery saver or policy): guidance works without it.
      }
    };
    const visible = () => void acquire();
    void acquire();
    document.addEventListener('visibilitychange', visible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', visible);
      void lock?.release();
    };
  }, [active]);
}
