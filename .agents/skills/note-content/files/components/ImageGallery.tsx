import { useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { ImetaEntry } from '@/lib/imeta';

interface ImageGalleryProps {
  images: string[];
  /** Max images to show in the grid before "+ more" overflow. */
  maxVisible?: number;
  maxGridHeight?: string;
  /** imeta metadata keyed by URL (dim, blurhash, etc.). Unused in this stub. */
  imetaMap?: Map<string, ImetaEntry>;
  lightboxIndex?: number | null;
  onLightboxOpen?: (index: number) => void;
  onLightboxClose?: () => void;
  className?: string;
}

/**
 * Minimal image gallery grid.
 *
 * Ditto's richer `ImageGallery` uses `imetaMap` for precise aspect ratios,
 * blurhash placeholders, CSS-grid masonry, pinch-to-zoom on mobile, and
 * keyboard navigation. Replace this stub with a richer gallery as needed.
 */
export function ImageGallery({
  images,
  maxVisible = 4,
  maxGridHeight,
  lightboxIndex,
  onLightboxOpen,
  onLightboxClose,
  className,
}: ImageGalleryProps) {
  const shown = images.slice(0, maxVisible);
  const extra = Math.max(0, images.length - maxVisible);

  // Two-column grid for 2+ images
  const gridCols = shown.length === 1 ? 'grid-cols-1' : 'grid-cols-2';

  return (
    <>
      <div
        className={cn(
          'grid gap-2 my-2.5 rounded-lg overflow-hidden',
          gridCols,
          className,
        )}
        style={maxGridHeight ? { maxHeight: maxGridHeight } : undefined}
      >
        {shown.map((url, idx) => (
          <button
            key={idx}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onLightboxOpen?.(idx);
            }}
            className="block relative overflow-hidden rounded-md bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <img
              src={url}
              alt=""
              loading="lazy"
              className="block w-full h-full object-cover hover:opacity-90 transition-opacity"
            />
            {idx === maxVisible - 1 && extra > 0 && (
              <div className="absolute inset-0 bg-black/50 text-white flex items-center justify-center text-xl font-semibold">
                +{extra}
              </div>
            )}
          </button>
        ))}
      </div>

      {lightboxIndex !== null && lightboxIndex !== undefined && (
        <Lightbox
          images={images}
          currentIndex={lightboxIndex}
          onClose={onLightboxClose ?? (() => { /* noop */ })}
        />
      )}
    </>
  );
}

interface LightboxProps {
  images: string[];
  currentIndex: number;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
}

/**
 * Minimal fullscreen lightbox — click-outside-to-close, arrow-key navigation.
 *
 * Ditto's richer `Lightbox` supports pinch-zoom, swipe gestures, download,
 * and alt-text overlays. Replace this stub with a richer viewer as needed.
 */
export function Lightbox({ images, currentIndex, onClose, onNext, onPrev }: LightboxProps) {
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') onNext?.();
      else if (e.key === 'ArrowLeft') onPrev?.();
    },
    [onClose, onNext, onPrev],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  const url = images[currentIndex];
  if (!url) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 text-white text-3xl leading-none hover:opacity-70"
        aria-label="Close"
      >
        ×
      </button>
      {onPrev && images.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-4xl leading-none hover:opacity-70"
          aria-label="Previous"
        >
          ‹
        </button>
      )}
      {onNext && images.length > 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-4xl leading-none hover:opacity-70"
          aria-label="Next"
        >
          ›
        </button>
      )}
      <img
        src={url}
        alt=""
        className="max-w-full max-h-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
