import type { IdentifyResult } from '@tonari/shared';
export type ErrorKind =
  | 'offline'
  | 'timeout'
  | 'expired'
  | 'tooLarge'
  | 'limited'
  | 'server'
  | 'protocol'
  | 'unconfigured';
export class GatewayError extends Error {
  constructor(
    public kind: ErrorKind,
    public retryAt = 0,
  ) {
    super(kind);
  }
}
export interface Session {
  token: string;
  expiresAt: string;
}
export interface Gateway {
  createSession(signal: AbortSignal): Promise<Session>;
  identify(image: Blob, session: Session, signal: AbortSignal): Promise<IdentifyResult>;
  getFlow(id: string, version: string, session: Session, signal: AbortSignal): Promise<unknown>;
}
