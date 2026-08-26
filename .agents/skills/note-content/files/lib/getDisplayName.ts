import type { NostrMetadata } from '@nostrify/nostrify';

/**
 * Get a display name for a user.
 * Uses metadata.name if available, otherwise falls back to "Anonymous".
 * Visual truncation is handled by CSS (`truncate` class) on the containing element
 * to avoid breaking NIP-30 custom emoji shortcodes.
 */
export function getDisplayName(
  metadata: NostrMetadata | undefined,
  _pubkey: string,
): string {
  return metadata?.name || 'Anonymous';
}
