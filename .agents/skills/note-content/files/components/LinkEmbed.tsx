import { cn } from '@/lib/utils';

interface LinkEmbedProps {
  url: string;
  className?: string;
  /** Hide the thumbnail image (e.g. when a cover image is already displayed above). */
  hideImage?: boolean;
}

/**
 * Minimal link preview card — renders the URL as a clickable block.
 *
 * Ditto's richer `LinkEmbed` fetches OpenGraph metadata (title, description,
 * thumbnail, YouTube/Tweet/ogimage extraction) and renders a proper preview
 * card. Replace this stub with a version that queries a metadata endpoint
 * of your choice (oEmbed, OG scrapers, etc.) when you want rich previews.
 */
export function LinkEmbed({ url, className, hideImage: _hideImage }: LinkEmbedProps) {
  let display = url;
  try {
    display = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    // keep raw url as display
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'block border rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors text-sm',
        className,
      )}
    >
      <div className="font-medium truncate">{display}</div>
      <div className="text-xs text-muted-foreground truncate">{url}</div>
    </a>
  );
}
