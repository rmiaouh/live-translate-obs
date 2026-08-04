import { describe, expect, it } from 'vitest';
import { activeSessionCount, estimateSessionCostUsd } from '../src/shared/cost';

describe('cost estimation', () => {
  it('uses one session for mixed mode and two for split mode', () => {
    expect(activeSessionCount('mixed')).toBe(1);
    expect(activeSessionCount('split')).toBe(2);
  });

  it('estimates the documented hourly costs', () => {
    expect(estimateSessionCostUsd(3_600_000, 'mixed')).toBeCloseTo(2.04, 5);
    expect(estimateSessionCostUsd(3_600_000, 'split')).toBeCloseTo(4.08, 5);
  });
});
