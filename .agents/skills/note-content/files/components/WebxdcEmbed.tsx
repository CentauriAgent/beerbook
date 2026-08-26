import { cn } from '@/lib/utils';

interface WebxdcEmbedProps {
  url: string;
  uuid?: string;
  name?: string;
  icon?: string;
  className?: string;
}

/**
 * Minimal WebXDC app embed — renders a download/launch link.
 *
 * WebXDC is a self-contained interactive app packaged as a .xdc zip.
 * Ditto's richer `WebxdcEmbed` renders the app in an iframe with a
 * message-passing bridge to Nostr for state sync. Replace this stub
 * with a full WebXDC host when needed; see https://webxdc.org for the spec.
 */
export function WebxdcEmbed({ url, name, icon, className }: WebxdcEmbedProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'flex items-center gap-3 border rounded-lg px-3 py-2 my-2.5 hover:bg-muted/50 transition-colors text-sm',
        className,
      )}
    >
      {icon && (
        <img src={icon} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{name ?? 'WebXDC app'}</div>
        <div className="text-xs text-muted-foreground truncate">{url}</div>
      </div>
    </a>
  );
}
