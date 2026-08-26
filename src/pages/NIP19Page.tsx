import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Profile } from './Profile';
import BeerDetail from './BeerDetail';
import NotFound from './NotFound';
import { decodeNip19, readerPath } from '@/lib/nip19links';

/**
 * Catch-all NIP-19 deep-link route: /npub1…, /nprofile1…, /note1…, /nevent1…, /naddr1…
 * Renders the right view without ever exposing raw hex identifiers in URLs.
 */
export function NIP19Page() {
  const { nip19: identifier } = useParams<{ nip19: string }>();
  const navigate = useNavigate();

  const decoded = identifier ? decodeNip19(identifier) : null;

  // Notes/events → reader deep link on the home book
  useEffect(() => {
    if (decoded && (decoded.type === 'note' || decoded.type === 'nevent')) {
      navigate(readerPath(decoded.eventId), { replace: true });
    }
  }, [decoded, navigate]);

  if (!decoded) {
    return <NotFound />;
  }

  switch (decoded.type) {
    case 'npub':
    case 'nprofile':
      return <Profile pubkey={decoded.pubkey} />;

    case 'note':
    case 'nevent':
      return (
        <div className="flex min-h-dvh items-center justify-center bg-amber-950 font-serif text-amber-200">
          Opening the page… 📖
        </div>
      );

    case 'naddr':
      // Beerbook addressable entity: kind 31006 beer records
      if (decoded.kind === 31006) return <BeerDetail naddr={decoded} />;
      return <NotFound />;

    default:
      return <NotFound />;
  }
}
