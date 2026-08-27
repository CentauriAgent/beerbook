import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { isPullArmed, pullDistance } from '@/lib/pull-refresh';

/**
 * Bookish pull-to-refresh indicator — a small cream-paper disc with an
 * amber chevron that lives just above the reader's top edge and slides
 * down with the finger (0.5x rubber-band, see `src/lib/pull-refresh.ts`).
 *
 * Fully imperative (refs + inline styles, no React state) so per-move
 * updates never re-render the page stack — same philosophy as PageTurn.
 * Inline styles + injected keyframes (not Tailwind) so the Tailwind-less
 * e2e harness build renders it identically.
 *
 * Lifecycle: setPull(rawDy)… → release arms? startSpin() while the feed
 * refetch settles → settle() pops a ✓ and fades out; below threshold the
 * caller just calls reset() and the disc springs back above the edge.
 */

export interface PullIndicatorHandle {
  /** Track the finger (raw downward dy in px). */
  setPull(rawDy: number): void;
  /** Spring back above the top edge (sub-threshold release / cancel). */
  reset(): void;
  /** Shrink in place and spin while the refresh runs. */
  startSpin(): void;
  /** "Updated" pop, then fade out. */
  settle(): void;
}

const STYLE_ID = 'bb-pull-indicator-keyframes';
const SPRING_TRANSITION = 'transform 320ms cubic-bezier(.2,.8,.3,1.25), opacity 220ms ease-out';

export const PullToRefreshIndicator = forwardRef<PullIndicatorHandle>(
  function PullToRefreshIndicator(_props, ref) {
    const rootRef = useRef<HTMLDivElement>(null);
    const pillRef = useRef<HTMLDivElement>(null);
    const chevronRef = useRef<SVGSVGElement>(null);
    const ringRef = useRef<HTMLDivElement>(null);
    const checkRef = useRef<SVGSVGElement>(null);
    /** Monotonic token so a late settle() timeout can't clobber a reset(). */
    const token = useRef(0);

    // Inject keyframes once per document (harness + app both use this).
    useEffect(() => {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        @keyframes bb-ptr-spin { to { transform: rotate(360deg); } }
        @keyframes bb-ptr-pulse { 0%,100% { opacity: 1; } 50% { opacity: .45; } }
        @keyframes bb-ptr-pop {
          0% { transform: scale(.5); opacity: 0; }
          40% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }`;
      document.head.appendChild(style);
      return () => {
        // Only remove when unmounting the last instance.
        if (document.querySelectorAll('[data-bb-ptr]').length <= 1) style.remove();
      };
    }, []);

    const idle = () => {
      const root = rootRef.current;
      if (!root) return;
      root.style.transition = SPRING_TRANSITION;
      root.style.transform = 'translate(-50%, -46px)';
      root.style.opacity = '0';
    };

    useImperativeHandle(
      ref,
      (): PullIndicatorHandle => ({
        setPull(rawDy) {
          token.current++;
          const root = rootRef.current;
          const pill = pillRef.current;
          const chevron = chevronRef.current;
          const ring = ringRef.current;
          const check = checkRef.current;
          if (!root || !pill || !chevron) return;

          const dist = pullDistance(rawDy);
          const armed = isPullArmed(rawDy);

          root.style.transition = 'none'; // finger-tracked: no easing
          root.style.transform = `translate(-50%, ${dist}px)`;
          root.style.opacity = String(Math.min(1, dist / 24 + 0.15));

          // Amber chevron flips to an up-arrow and pulses once armed.
          chevron.style.display = 'block';
          chevron.style.transform = armed ? 'rotate(180deg) scale(1.08)' : 'rotate(0deg) scale(1)';
          chevron.style.animation = armed ? 'bb-ptr-pulse 1s ease-in-out infinite' : '';
          chevron.style.color = armed ? '#b45309' : '#d97706';
          if (ring) ring.style.display = 'none';
          if (check) check.style.display = 'none';
        },

        reset() {
          token.current++;
          const chevron = chevronRef.current;
          const ring = ringRef.current;
          const check = checkRef.current;
          if (chevron) {
            chevron.style.transform = 'rotate(0deg) scale(1)';
            chevron.style.animation = '';
            chevron.style.color = '#d97706';
          }
          if (ring) ring.style.display = 'none';
          if (check) check.style.display = 'none';
          idle();
        },

        startSpin() {
          token.current++;
          const root = rootRef.current;
          const chevron = chevronRef.current;
          const ring = ringRef.current;
          if (!root) return;
          root.style.transition = 'transform 160ms ease-out, opacity 160ms ease-out';
          root.style.transform = 'translate(-50%, 12px)';
          root.style.opacity = '1';
          if (chevron) chevron.style.display = 'none';
          if (ring) ring.style.display = 'block';
        },

        settle() {
          const my = ++token.current;
          const root = rootRef.current;
          const ring = ringRef.current;
          const check = checkRef.current;
          if (!root) return;
          if (ring) ring.style.display = 'none';
          if (check) {
            check.style.display = 'block';
            check.style.animation = 'bb-ptr-pop 500ms cubic-bezier(.2,.8,.3,1.25)';
          }
          // Pop in, hold, then fade out.
          window.setTimeout(() => {
            if (token.current !== my) return;
            root.style.transition = 'opacity 450ms ease-out, transform 450ms ease-in';
            root.style.opacity = '0';
            root.style.transform = 'translate(-50%, -10px)';
          }, 550);
          window.setTimeout(() => {
            if (token.current !== my) return;
            if (check) check.style.display = 'none';
          }, 1100);
        },
      }),
      [],
    );

    return (
      <div
        ref={rootRef}
        data-bb-ptr
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          width: 40,
          height: 40,
          marginTop: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 60,
          opacity: 0,
          transform: 'translate(-50%, -46px)',
          transition: SPRING_TRANSITION,
          pointerEvents: 'none',
          willChange: 'transform, opacity',
        }}
      >
        {/* Cream book-paper disc with a warm amber rim. */}
        <div
          ref={pillRef}
          style={{
            width: 34,
            height: 34,
            borderRadius: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'hsl(40 55% 94%)',
            backgroundImage: 'radial-gradient(rgba(180,130,60,0.12) 1px, transparent 1px)',
            backgroundSize: '12px 12px',
            boxShadow: '0 2px 10px rgba(0,0,0,.4), inset 0 0 0 1.5px rgba(180,120,40,.5)',
          }}
        >
          {/* Amber spinner — spins while the feed refetch settles. */}
          <div
            ref={ringRef}
            style={{
              display: 'none',
              width: 18,
              height: 18,
              borderRadius: 9999,
              border: '2.5px solid rgba(217,119,6,.25)',
              borderTopColor: '#d97706',
              animation: 'bb-ptr-spin .8s linear infinite',
            }}
          />
          {/* Down-chevron (flips up + pulses once armed). */}
          <svg
            ref={chevronRef}
            viewBox="0 0 24 24"
            width={20}
            height={20}
            fill="none"
            stroke="#d97706"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transition: 'transform 160ms ease-out, color 160ms ease-out' }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
          {/* Settled check. */}
          <svg
            ref={checkRef}
            viewBox="0 0 24 24"
            width={20}
            height={20}
            fill="none"
            stroke="#b45309"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ display: 'none' }}
          >
            <path d="M4.5 12.5l5 5 10-11" />
          </svg>
        </div>
      </div>
    );
  },
);
