import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
  className?: string;
}

export function StarRating({ value, onChange, size = 24, className }: StarRatingProps) {
  return (
    <div className={cn('flex items-center gap-1', className)} role="radiogroup" aria-label="Rating">
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
            className={n <= value ? 'fill-amber-400 text-amber-400 drop-shadow' : 'text-white/60'}
            strokeWidth={1.5}
          />
        </button>
      ))}
    </div>
  );
}
