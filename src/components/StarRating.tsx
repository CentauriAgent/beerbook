import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StarRatingProps {
  value: number; // 0–5, halves supported
  onChange?: (value: number) => void;
  size?: number;
  className?: string;
}

/**
 * Read-mostly star rating with half-star fills, designed to sit on top
 * of photos: filled = solid amber with dark outline/glow so it reads on
 * light AND dark photos; empty = translucent amber-gold, never plain
 * white-on-white. Tap halves to change when `onChange` is provided.
 */
export function StarRating({ value, onChange, size = 28, className }: StarRatingProps) {
  return (
    <div className={cn('flex items-center gap-1.5 rounded-full bg-black/35 px-2 py-1 backdrop-blur-sm', className)} role="radiogroup" aria-label={`Rated ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, value - (n - 1)));
        return (
          <div key={n} className="relative" style={{ width: size, height: size }}>
            <Star size={size} className="text-amber-200/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]" strokeWidth={1.75} />
            <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star size={size} className="fill-amber-400 text-amber-700 drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]" strokeWidth={2} />
            </div>
            {onChange && (
              <>
                <button
                  type="button"
                  aria-label={`${n - 0.5} stars`}
                  onClick={(e) => { e.stopPropagation(); onChange(value === n - 0.5 ? 0 : n - 0.5); }}
                  className="absolute inset-y-0 left-0 w-1/2 cursor-pointer"
                />
                <button
                  type="button"
                  aria-label={`${n} stars`}
                  onClick={(e) => { e.stopPropagation(); onChange(value === n ? n - 0.5 : n); }}
                  className="absolute inset-y-0 right-0 w-1/2 cursor-pointer"
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
