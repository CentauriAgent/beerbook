/**
 * Viewer's own custom emoji collection (NIP-30).
 *
 * This minimal stub returns an empty list. To enable the viewer's
 * custom emojis as a fallback when posts don't carry their own
 * `emoji` tags, replace this implementation with one that fetches
 * the user's kind 10030 "Emoji List" event and any kind 30030
 * "Emoji Set" events it references, then exposes every shortcode
 * → URL pair here.
 */
export function useCustomEmojis(): { emojis: Array<{ shortcode: string; url: string }> } {
  return { emojis: [] };
}
