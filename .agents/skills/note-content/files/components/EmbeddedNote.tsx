import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { cn } from '@/lib/utils';

interface EmbeddedNoteProps {
  eventId: string;
  relays?: string[];
  authorHint?: string;
  className?: string;
}

/**
 * Minimal embedded-note card — renders a link to the referenced event.
 *
 * Ditto's richer `EmbeddedNote` fetches the quoted event, renders its
 * author, timestamp, and (recursively) its content inside a card.
 * Replace this stub with a version that uses a `useEvent(id, relays, author)`
 * hook to fetch and render the quoted note.
 */
export function EmbeddedNote({ eventId, relays, authorHint, className }: EmbeddedNoteProps) {
  const neventId = nip19.neventEncode({
    id: eventId,
    ...(authorHint ? { author: authorHint } : {}),
    ...(relays?.length ? { relays } : {}),
  });

  return (
    <Link
      to={`/${neventId}`}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'block border rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors text-sm',
        className,
      )}
    >
      <div className="font-medium">Quoted note</div>
      <div className="text-xs text-muted-foreground font-mono truncate">
        {neventId.slice(0, 24)}…
      </div>
    </Link>
  );
}
