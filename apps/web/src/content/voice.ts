import type { Flow } from '@tonari/shared';
import generated from './voice-manifest.json';
export interface VoiceManifest {
  flow_id: string;
  version: string;
  voice: string | null;
  speaking_rate: number | null;
  /** Exact spoken text → prerecorded file. A changed sentence has no file and falls back to device speech. */
  items: Record<string, string>;
}
export const voiceManifest: VoiceManifest = generated;
export function voiceFile(flow: Flow, text: string, manifest: VoiceManifest = voiceManifest) {
  if (manifest.flow_id !== flow.flow_id || manifest.version !== flow.version) return undefined;
  return Object.hasOwn(manifest.items, text) ? manifest.items[text] : undefined;
}
