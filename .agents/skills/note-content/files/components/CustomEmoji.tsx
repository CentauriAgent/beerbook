import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface CustomEmojiImgProps {
  /** Shortcode without surrounding colons. */
  name: string;
  /** The emoji image URL from a NIP-30 `emoji` tag. */
  url: string;
  className?: string;
}

/**
 * Inline NIP-30 custom emoji image.
 */
export function CustomEmojiImg({ name, url, className }: CustomEmojiImgProps) {
  return (
    <img
      src={url}
      alt={`:${name}:`}
      title={`:${name}:`}
      draggable={false}
      loading="lazy"
      className={cn(
        'inline h-[1.2em] w-[1.2em] object-contain align-text-bottom',
        className,
      )}
    />
  );
}

interface EmojifiedTextProps {
  /** Event tags containing NIP-30 `emoji` entries used to resolve shortcodes. */
  tags: string[][];
  children: string;
  className?: string;
}

/**
 * Render a string, replacing `:shortcode:` patterns with inline
 * custom emoji images sourced from the provided `emoji` tags.
 * Used inside usernames, reaction displays, etc.
 */
export function EmojifiedText({ tags, children, className }: EmojifiedTextProps) {
  const emojiMap = new Map<string, string>();
  for (const tag of tags) {
    if (tag[0] === 'emoji' && tag[1] && tag[2]) {
      emojiMap.set(tag[1], tag[2]);
    }
  }

  if (emojiMap.size === 0) {
    return <span className={className}>{children}</span>;
  }

  const parts: ReactNode[] = [];
  const regex = /:([a-zA-Z0-9_-]+):/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(children)) !== null) {
    const [full, shortcode] = match;
    const url = emojiMap.get(shortcode);
    if (!url) continue;

    if (match.index > lastIndex) {
      parts.push(children.substring(lastIndex, match.index));
    }
    parts.push(
      <CustomEmojiImg
        key={`emoji-${match.index}`}
        name={shortcode}
        url={url}
      />,
    );
    lastIndex = match.index + full.length;
  }

  if (lastIndex < children.length) {
    parts.push(children.substring(lastIndex));
  }

  return (
    <span className={className}>
      {parts.length > 0 ? parts : children}
    </span>
  );
}
