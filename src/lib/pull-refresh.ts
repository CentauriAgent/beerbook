/**
 * Custom pull-to-refresh math (pure, unit-tested).
 *
 * The reader is full-bleed and never scrolls vertically, so any deliberate
 * downward drag at the top is a candidate refresh gesture. The finger maps
 * to the indicator at ~0.5x (rubber-band resistance) and the refresh arms
 * after PULL_ARM_PX of *displayed* pull — a long, deliberate yank that
 * cannot collide with the x-locked page-turn swipes.
 */

/** Finger → indicator mapping (displayed px = raw px × this). */
export const PULL_RESISTANCE = 0.5;
/** Displayed pull (px) required to arm the refresh on release. */
export const PULL_ARM_PX = 100;
/** Raw finger travel (px) beyond which the indicator stops growing. */
export const PULL_MAX_RAW_PX = 320;

/** Displayed pull distance for a raw downward finger travel (px). */
export function pullDistance(rawDy: number): number {
  if (rawDy <= 0) return 0;
  return Math.min(rawDy, PULL_MAX_RAW_PX) * PULL_RESISTANCE;
}

/** True when releasing now should trigger the refresh. */
export function isPullArmed(rawDy: number): boolean {
  return pullDistance(rawDy) >= PULL_ARM_PX;
}
