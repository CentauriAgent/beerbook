import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { cn } from '@/lib/utils';
import type { AddrCoords } from '@/components/NoteContent';

interface EmbeddedNaddrProps {
  addr: AddrCoords;
  className?: string;
}

/**
 * Minimal embedded-naddr card — renders a link to the referenced
 * addressable event (kind:pubkey:identifier).
 *
 * Ditto's richer `EmbeddedNaddr` fetches the addressable event (long-form
 * article, marketplace listing, etc.) and renders a preview card with
 * title, author, cover image, and summary. Replace this stub with a
 * version that uses `useAddrEvent({kind, pubkey, identifier})` to fetch
 * and render the target event.
 */
export function EmbeddedNaddr({ addr, className }: EmbeddedNaddrProps) {
  const naddrId = nip19.naddrEncode({
    kind: addr.kind,
    pubkey: addr.pubkey,
    identifier: addr.identifier,
  });

  return (
    <Link
      to={`/${naddrId}`}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'block border rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors text-sm',
        className,
      )}
    >
      <div className="font-medium">Addressable event</div>
      <div className="text-xs text-muted-foreground font-mono truncate">
        kind:{addr.kind} · {addr.identifier || '(no identifier)'}
      </div>
    </Link>
  );
}
