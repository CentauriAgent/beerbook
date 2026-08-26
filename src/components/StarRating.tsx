import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
  className?: string;
}

/**
 * High-contrast star rating designed to sit on top of photos:
 * - filled: solid amber with a dark outline + glow so it reads on light AND dark photos
 * - empty: translucent amber-gold with a dark rim, never plain white-on-white
 */
export function StarRating({ value, onChange, size = 28, className }: StarRatingProps) {
  return (
    <div className={cn('flex items-center gap-1.5 rounded-full bg-black/35 px-2 py-1 backdrop-blur-sm', className)} role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          disabled={!onChange}
          onClick={(e) => {
            e.stopPropagation();
            onChange?.(n === value ? 0 : n);
          }}
          className={onChange ? 'cursor-pointer transition-transform hover:scale-110' : 'cursor-default'}
        >
          <Star
            size={size}
            className={cn(
              'drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]',
              n <= value
                ? 'fill-amber-400 text-amber-700'
                : 'text-amber-200/90',
            )}
            strokeWidth={n <= value ? 2 : 1.75}
          />
        </button>
      ))}
    </div>
  );
}
