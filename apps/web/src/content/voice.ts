import type { Flow } from '@tonari/shared';
import generated from './voice-manifest.json';
export interface VoiceManifest {
  flow_id: string;
  version: string;
  voice: string | null;
  speaking_rate: number | null;
  /** Exact spoken text → prerecorded file for this flow version. */
  items: Record<string, string>;
  /** Fixed app copy (capture, errors, staff) shared by every flow. */
  common: Record<string, string>;
}
export const voiceManifest: VoiceManifest = generated;
const own = (map: Record<string, string>, text: string) => (Object.hasOwn(map, text) ? map[text] : undefined);
/** A changed sentence has no file and falls back to device speech. */
export function voiceFile(flow: Flow | null, text: string, manifest: VoiceManifest = voiceManifest) {
  const common = own(manifest.common, text);
  if (common || !flow) return common;
  if (manifest.flow_id !== flow.flow_id || manifest.version !== flow.version) return undefined;
  return own(manifest.items, text);
}
