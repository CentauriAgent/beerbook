/**
 * An avatar shape is stored in kind-0 metadata as the `shape` property.
 * Typically an emoji glyph used as a mask (e.g. "🐱", "⭐").
 *
 * This minimal stub exposes just enough surface for `NoteContent` to
 * read the shape and pass it into `AudioVisualizer`. The stubbed
 * `AudioVisualizer` ignores it; a richer implementation would use
 * the shape to generate a CSS mask URL for the avatar.
 */
export type AvatarShape = string;

/**
 * Extract the avatar shape from Nostr metadata. Returns `undefined`
 * when the metadata is missing or has no `shape` field.
 */
export function getAvatarShape(
  metadata: { [key: string]: unknown } | undefined,
): AvatarShape | undefined {
  if (!metadata) return undefined;
  const shape = metadata.shape;
  if (typeof shape !== 'string') return undefined;
  // Light guard: only return short, non-ASCII values (emoji-like)
  if (shape.length === 0 || shape.length > 20) return undefined;
  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\x7F]/.test(shape)) return undefined;
  return shape;
}
