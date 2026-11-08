import { useSyncExternalStore } from 'react';
/** Per-device convenience only: whether guidance starts speaking by itself. No personal data. */
const KEY = 'tonari.autoVoice';
const listeners = new Set<() => void>();
let cached: boolean | null = null;
function read() {
  if (cached === null) {
    try {
      cached = localStorage.getItem(KEY) !== 'off';
    } catch {
      cached = true;
    }
  }
  return cached;
}
export function setAutoVoice(on: boolean) {
  cached = on;
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, 'off');
  } catch {
    // Storage blocked: the choice still holds for this page.
  }
  listeners.forEach((listener) => listener());
}
export function useAutoVoice() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => true,
  );
}
