import { describe, expect, it } from 'vitest';
import {
  isPullArmed,
  pullDistance,
  PULL_ARM_PX,
  PULL_MAX_RAW_PX,
  PULL_RESISTANCE,
} from './pull-refresh';

describe('pullDistance', () => {
  it('is 0 for upward / zero drags', () => {
    expect(pullDistance(-50)).toBe(0);
    expect(pullDistance(-1)).toBe(0);
    expect(pullDistance(0)).toBe(0);
  });

  it('maps downward pull at the rubber-band resistance', () => {
    expect(pullDistance(100)).toBeCloseTo(100 * PULL_RESISTANCE);
    expect(pullDistance(240)).toBeCloseTo(240 * PULL_RESISTANCE);
  });

  it('clamps at the max raw travel', () => {
    expect(pullDistance(PULL_MAX_RAW_PX)).toBe(PULL_MAX_RAW_PX * PULL_RESISTANCE);
    expect(pullDistance(PULL_MAX_RAW_PX + 500)).toBe(PULL_MAX_RAW_PX * PULL_RESISTANCE);
  });
});

describe('isPullArmed', () => {
  it('arms exactly at the threshold (raw = arm / resistance)', () => {
    const rawArm = PULL_ARM_PX / PULL_RESISTANCE; // 200px of finger
    expect(isPullArmed(rawArm)).toBe(true);
    expect(isPullArmed(rawArm - 1)).toBe(false);
  });

  it('never arms for short or upward pulls', () => {
    expect(isPullArmed(0)).toBe(false);
    expect(isPullArmed(100)).toBe(false); // 50px displayed
    expect(isPullArmed(-300)).toBe(false);
  });
});
