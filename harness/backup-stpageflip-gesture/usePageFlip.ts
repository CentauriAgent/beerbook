/**
 * BACKUP (Aug 26, 2026) — my StPageFlip-based gesture implementation,
 * deleted by concurrent work that replaced StPageFlip with a custom
 * PageTurn renderer. This version was verified: real CDP touch fast-swipes
 * turn pages both directions; slow drags render live folds (2 clipped pages
 * mid-drag) and commit at >30% drag width. Restore alongside
 * useSwipeTurn.ts + the PageReader wiring in PageReader.backup-notes.md.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { PageFlip } from 'page-flip';

/** Selector for the page elements StPageFlip should adopt. */
const PAGE_SELECTOR = '[data-flip-page]';

export interface UsePageFlipParams {
  containerRef: RefObject<HTMLDivElement | null>;
  width: number;
  height: number;
  enabled: boolean;
  dataKey: string;
  initialPage?: number;
  onFlipStart?: () => void;
  onPageChange?: (pageIndex: number) => void;
}

export interface PageFlipApi {
  flipNext: () => void;
  flipPrev: () => void;
  /** Live library instance (or null between inits) — for the gesture layer
   * that drives the library's public drag API (startUserTouch/userMove/…). */
  getFlip: () => PageFlip | null;
  /** Bump: increments on every (re-)init — for effects that need the ref. */
  instanceId: number;
}

export function usePageFlip({
  containerRef,
  width,
  height,
  enabled,
  dataKey,
  initialPage = 0,
  onFlipStart,
  onPageChange,
}: UsePageFlipParams): PageFlipApi {
  const flipRef = useRef<PageFlip | null>(null);
  const pageRef = useRef(initialPage);
  const [instanceId, setInstanceId] = useState(0);
  const lastDataKey = useRef(dataKey);
  const dataKeyRef = useRef(dataKey);
  const callbacks = useRef({ onFlipStart, onPageChange });

  useEffect(() => {
    dataKeyRef.current = dataKey;
    callbacks.current = { onFlipStart, onPageChange };
  }, [dataKey, onFlipStart, onPageChange]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled || width < 20 || height < 20) return;

    const items = Array.from(el.querySelectorAll<HTMLElement>(PAGE_SELECTOR));
    if (items.length === 0) return;

    const startPage = Math.min(Math.max(0, pageRef.current), items.length - 1);

    const flip = new PageFlip(el, {
      width,
      height,
      size: 'fixed',
      usePortrait: true,
      mobileScrollSupport: false, // we own gestures; no scroll fighting
      // We own ALL input via our pointer-event gesture layer (useSwipeTurn):
      // the library's own touch path is dead on real Android devices and its
      // mouse handlers conflict with ours. useMouseEvents:false installs no
      // input listeners at all (resize listener is unconditional).
      useMouseEvents: false,
      disableFlipByClick: true, // we keep our own edge-click zones
      showCover: false,
      drawShadow: true,
      maxShadowOpacity: 0.5,
      flippingTime: 650,
      swipeDistance: 30,
      showPageCorners: true,
      autoSize: false,
    });

    flipRef.current = flip;

    flip.on('flip', (e) => {
      pageRef.current = e.data as number;
      callbacks.current.onPageChange?.(pageRef.current);
    });
    flip.on('changeState', (e) => {
      if (e.data === 'flipping') callbacks.current.onFlipStart?.();
    });

    flip.loadFromHTML(items);

    // Deep link / resize restore: show without animation.
    if (startPage > 0) flip.turnToPage(startPage);
    lastDataKey.current = dataKeyRef.current;
    setInstanceId((id) => id + 1);

    return () => {
      // Rescue the page elements out of the wrapper before destroy removes
      // it (destroy deletes .stf__wrapper + .stf__block, pages included).
      const rescued = Array.from(el.querySelectorAll<HTMLElement>(PAGE_SELECTOR));
      try {
        flip.destroy();
      } catch {
        // Already torn down — nothing to do.
      }
      for (const item of rescued) el.appendChild(item);
      if (flipRef.current === flip) flipRef.current = null;
    };
  }, [containerRef, enabled, width, height]);

  useEffect(() => {
    if (lastDataKey.current === dataKey) return;
    lastDataKey.current = dataKey;
    const flip = flipRef.current;
    const el = containerRef.current;
    if (!flip || !el) return;
    const items = Array.from(el.querySelectorAll<HTMLElement>(PAGE_SELECTOR));
    if (items.length === 0) return;
    try {
      flip.updateFromHtml(items);
    } catch {
      // Mid-flip updates can throw; next init/retry heals it.
    }
  }, [dataKey, instanceId, containerRef]);

  const programmaticFlip = useCallback((fn: (flip: PageFlip) => void) => {
    const flip = flipRef.current;
    if (!flip) return;
    const settings = flip.getSettings();
    const wasDisabled = settings.disableFlipByClick;
    settings.disableFlipByClick = false;
    try {
      fn(flip);
    } finally {
      settings.disableFlipByClick = wasDisabled;
    }
  }, []);

  const flipNext = useCallback(() => {
    programmaticFlip((flip) => flip.flipNext('bottom'));
  }, [programmaticFlip]);

  const flipPrev = useCallback(() => {
    programmaticFlip((flip) => flip.flipPrev('bottom'));
  }, [programmaticFlip]);

  const getFlip = useCallback(() => flipRef.current, []);

  return { flipNext, flipPrev, getFlip, instanceId };
}
