import { useState, useCallback } from 'react';

/**
 * Blossom-server fallback hook.
 *
 * When an image URL is hosted on a Blossom server that goes down,
 * apps can retry the same hash on a different server. This minimal
 * stub simply returns the original URL and a no-op `onError` handler.
 * Replace with a richer implementation that parses the URL's hash
 * suffix and rotates through the viewer's BUD-03 "User Server List"
 * (kind 10063) or an app-configured server list.
 */
export function useBlossomFallback(url: string): { src: string; onError: () => void } {
  const [src, setSrc] = useState(url);
  const onError = useCallback(() => {
    // Stub: no-op. A real implementation would swap `src` to the next
    // known Blossom mirror here.
    setSrc((prev) => prev);
  }, []);
  return { src, onError };
}
