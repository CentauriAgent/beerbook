import { cn } from '@/lib/utils';

interface AudioVisualizerProps {
  src: string;
  mime?: string;
  avatarUrl?: string;
  avatarFallback?: string;
  avatarShape?: string;
  className?: string;
}

/**
 * Minimal inline audio player — renders a native `<audio controls>`
 * alongside the author's avatar.
 *
 * Ditto's richer `AudioVisualizer` renders a waveform visualization,
 * applies `avatarShape` as a CSS mask, and supports background playback
 * state. Replace this stub with a richer player (e.g. using WebAudio +
 * Canvas visualization) when desired.
 */
export function AudioVisualizer({
  src,
  avatarUrl,
  avatarFallback,
  avatarShape: _avatarShape,
  className,
}: AudioVisualizerProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 border rounded-lg px-3 py-2 my-2.5',
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="shrink-0 w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-sm font-medium">{avatarFallback ?? '?'}</span>
        )}
      </div>
      <audio src={src} controls preload="metadata" className="flex-1 min-w-0" />
    </div>
  );
}
