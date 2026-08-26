import { describe, expect, it } from 'vitest';
import {
  bottomClipCss,
  computeFold,
  flapClipCss,
  flapTranslate,
  innerShadowStyle,
  outerShadowStyle,
} from './page-fold';

const W = 400;
const H = 700;

describe('computeFold', () => {
  it('returns a fold with sane geometry mid-turn (forward)', () => {
    const fold = computeFold({ x: 200, y: 600, width: W, height: H, direction: 'forward', corner: 'bottom' });
    expect(fold).not.toBeNull();
    // Progress: |(200 - 400) / 800| * 100 = 25
    expect(fold!.progress).toBeCloseTo(25, 0);
    // Angle is direction-signed and within a sane range (bottom corners
    // negate inside calculateAngle, then the direction sign is applied).
    expect(Math.abs(fold!.angle)).toBeLessThanOrEqual(Math.PI);
    // Flap is anchored at the rotated page corner — may sit outside the
    // page mid-fold (the clip-path does the masking), like StPageFlip.
    const t = flapTranslate(fold!);
    expect(t.x).toBeGreaterThanOrEqual(-2 * W);
    expect(t.x).toBeLessThanOrEqual(2 * W);
    expect(flapClipCss(fold!)).toMatch(/^polygon\(/);
    // Forward reveals the bottom page.
    expect(bottomClipCss(fold!)).toMatch(/^polygon\(/);
  });

  it('grows progress monotonically as the corner is dragged across (both directions)', () => {
    const fwd = (x: number) =>
      computeFold({ x, y: H - 10, width: W, height: H, direction: 'forward', corner: 'bottom' })?.progress ?? -1;
    const back = (x: number) =>
      computeFold({ x, y: H - 10, width: W, height: H, direction: 'back', corner: 'bottom' })?.progress ?? -1;
    expect(back(30)).toBeLessThan(back(200));
    expect(back(200)).toBeLessThan(back(380));
    const p = fwd;
    expect(p(390)).toBeLessThan(p(200));
    expect(p(200)).toBeLessThan(p(50));
    expect(p(50)).toBeLessThanOrEqual(50);
  });

  it('is degenerate (null) exactly at the resting corner', () => {
    const fold = computeFold({ x: W, y: 1, width: W, height: H, direction: 'forward', corner: 'top' });
    expect(fold).toBeNull();
  });

  it('back is the EXACT mirror of forward (single shared geometry path)', () => {
    // computeFold takes RAW container coords and mirrors 'back' internally
    // (page x = W - input.x), then runs the identical forward math. So a
    // back drag at x=150 must produce the SAME forward-space geometry as a
    // forward fold driven at x = W - 150 = 250 — angle, pageRect, shadows,
    // progress all identical. Only the rendering is mirrored (fold layer
    // scaleX(-1) + mirrored flap clip), which is what makes back a TRUE
    // mirror instead of a divergent branch.
    const back = computeFold({ x: 150, y: 600, width: W, height: H, direction: 'back', corner: 'bottom' });
    const fwdAt250 = computeFold({ x: 250, y: 600, width: W, height: H, direction: 'forward', corner: 'bottom' });
    expect(back).not.toBeNull();
    expect(fwdAt250).not.toBeNull();
    expect(back!.progress).toBeCloseTo(fwdAt250!.progress, 5);
    expect(back!.angle).toBeCloseTo(fwdAt250!.angle, 5);
    expect(back!.position).toEqual(fwdAt250!.position);
    for (const key of ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const) {
      expect(back!.pageRect[key].x).toBeCloseTo(fwdAt250!.pageRect[key].x, 3);
      expect(back!.pageRect[key].y).toBeCloseTo(fwdAt250!.pageRect[key].y, 3);
    }
    expect(back!.shadow.pos).toEqual(fwdAt250!.shadow.pos);
    expect(back!.shadow.angle).toBeCloseTo(fwdAt250!.shadow.angle, 5);
    // Shared bottom-clip geometry (renderer applies it on forward only).
    expect(bottomClipCss(back!)).toBe(bottomClipCss(fwdAt250!));
    // Render contract: same flap translate; identical forward-space flap
    // clip (the horizontal mirror is applied by flapClipCss for 'back').
    expect(flapTranslate(back!)).toEqual(flapTranslate(fwdAt250!));
    expect(back!.flapClip.length).toEqual(fwdAt250!.flapClip.length);
    for (let i = 0; i < back!.flapClip.length; i++) {
      expect(back!.flapClip[i].x).toBeCloseTo(fwdAt250!.flapClip[i].x, 6);
      expect(back!.flapClip[i].y).toBeCloseTo(fwdAt250!.flapClip[i].y, 6);
    }
    // flapClipCss is IDENTICAL for both directions: the renderer's
    // scaleX(-1) mirror layer produces the strict horizontal mirror of the
    // forward fold region, so no clip-level mirroring is needed (and none
    // must be added — that would double-mirror).
    expect(flapClipCss(back!)).toBe(flapClipCss(fwdAt250!));
  });

  it('produces shadow overlays within the page bounds', () => {
    const fold = computeFold({ x: 200, y: 600, width: W, height: H, direction: 'forward', corner: 'bottom' })!;
    const outer = outerShadowStyle(fold, W, H);
    const inner = innerShadowStyle(fold, W, H);
    expect(outer.width).toBeGreaterThan(0);
    expect(inner.width).toBeGreaterThan(0);
    expect(outer.gradient).toContain('linear-gradient');
    expect(inner.clip).toMatch(/^polygon\(/);
    expect(fold.shadow.opacity).toBeGreaterThan(0);
    expect(fold.shadow.opacity).toBeLessThanOrEqual(0.5);
  });

  it('keeps the first 10% of the gesture visible (flap exists near the corner)', () => {
    // 30px in from the rest edge must already produce a rendered flap.
    const fold = computeFold({ x: W - 30, y: 600, width: W, height: H, direction: 'forward', corner: 'bottom' });
    expect(fold).not.toBeNull();
    expect(fold!.flapClip.length).toBeGreaterThanOrEqual(3);
    expect(flapClipCss(fold!)).toMatch(/^polygon\(/);
  });

  it('corner-anchored y: fold at the anchor corner y is valid and full-height', () => {
    // The gesture layer clamps y to the anchor corner (bottom → y=H-1, top
    // → y=1; exactly on the edge is degenerate). The fold there must be
    // valid across the whole x sweep — this is the geometry mid-page drags
    // now use.
    for (const x of [W - 18, 300, 200, 100, 20]) {
      const fold = computeFold({ x, y: H - 1, width: W, height: H, direction: 'forward', corner: 'bottom' });
      expect(fold).not.toBeNull();
      expect(fold!.flapClip.length).toBeGreaterThanOrEqual(3);
      const back = computeFold({ x: W - x, y: H - 1, width: W, height: H, direction: 'back', corner: 'bottom' });
      expect(back).not.toBeNull();
      expect(back!.progress).toBeCloseTo(fold!.progress, 5);
    }
  });
});
