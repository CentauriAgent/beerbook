import { cn } from '@/lib/utils';

interface VideoPlayerProps {
  src: string;
  poster?: string;
  /** Pixel dimensions from NIP-94 `dim` tag, e.g. "1280x720". */
  dim?: string;
  /** Blurhash placeholder from NIP-94 `blurhash` tag. */
  blurhash?: string;
  artist?: string;
  className?: string;
}

/**
 * Minimal inline video player — renders a native `<video controls>`.
 *
 * Ditto's richer `VideoPlayer` renders a blurhash placeholder, respects
 * `dim` for correct aspect ratio, supports background scrubbing, picture-in-picture,
 * and lightbox playback. Replace this stub with a richer player as needed.
 */
export function VideoPlayer({ src, poster, dim, blurhash: _blurhash, artist: _artist, className }: VideoPlayerProps) {
  // Compute aspect ratio from "WxH" if provided
  let aspectRatio: string | undefined;
  if (dim) {
    const match = dim.match(/^(\d+)x(\d+)$/);
    if (match) {
      aspectRatio = `${match[1]} / ${match[2]}`;
    }
  }

  return (
    <video
      src={src}
      poster={poster}
      controls
      preload="metadata"
      playsInline
      className={cn('block rounded-lg my-2.5 w-full max-h-[480px] bg-black', className)}
      style={aspectRatio ? { aspectRatio } : undefined}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
