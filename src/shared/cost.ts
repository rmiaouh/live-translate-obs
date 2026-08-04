import { PRICE_PER_SESSION_MINUTE_USD, type CaptureMode } from './contracts';

export function activeSessionCount(mode: CaptureMode): number {
  return mode === 'split' ? 2 : 1;
}

export function estimateSessionCostUsd(elapsedMs: number, mode: CaptureMode): number {
  const minutes = Math.max(0, elapsedMs) / 60_000;
  return minutes * activeSessionCount(mode) * PRICE_PER_SESSION_MINUTE_USD;
}
