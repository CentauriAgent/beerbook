import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RatingInputProps {
  value: number; // 0–5, halves allowed
  onChange: (value: number) => void;
  className?: string;
}

const RATING_WORDS = (v: number): string | undefined => {
  if (v === 0) return undefined;
  if (v <= 1) return 'Drain pour 😖';
  if (v <= 2) return 'Not for me';
  if (v <= 3) return 'Decent';
  if (v <= 4) return 'Good beer';
  if (v < 5) return 'Excellent!';
  return 'World class 🏆';
};

/**
 * Interactive rating input for the composer:
 * - a fine-grained slider (0–5 in halves) that's easy to hit on mobile
 * - big stars with half-star fills mirroring the slider
 * - tapping the left/right half of a star steps in 0.5 increments
 * - live numeric + descriptor label
 */
export function RatingInput({ value, onChange, className }: RatingInputProps) {
  const [dragging, setDragging] = useState(false);

  return (
    <div className={cn('rounded-xl border border-amber-300 bg-gradient-to-b from-amber-50 to-amber-100/60 p-4', className)}>
      {/* Stars row — tap halves for 0.5 steps */}
      <div className="flex items-center justify-center gap-1.5" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => {
          const fill = Math.max(0, Math.min(1, value - (n - 1))); // 0, 0.5, or 1
          return (
            <div key={n} className="relative">
              {/* base (empty) star */}
              <Star size={34} className="text-amber-300" strokeWidth={1.75} />
              {/* filled overlay clipped to fill fraction */}
              <div
                className="pointer-events-none absolute inset-0 overflow-hidden"
                style={{ width: `${fill * 100}%` }}
              >
                <Star size={34} className="fill-amber-500 text-amber-600" strokeWidth={2} />
              </div>
              {/* hit areas: left half = n-0.5, right half = n */}
              <button
                type="button"
                aria-label={`${n - 0.5} stars`}
                onClick={() => onChange(value === n - 0.5 ? 0 : n - 0.5)}
                className="absolute inset-y-0 left-0 w-1/2 cursor-pointer"
              />
              <button
                type="button"
                aria-label={`${n} stars`}
                onClick={() => onChange(value === n ? n - 0.5 : n)}
                className="absolute inset-y-0 right-0 w-1/2 cursor-pointer"
              />
            </div>
          );
        })}
      </div>

      {/* Slider for fine control */}
      <input
        type="range"
        min={0}
        max={5}
        step={0.5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerDown={() => setDragging(true)}
        onPointerUp={() => setDragging(false)}
        className="mt-3 w-full cursor-pointer accent-amber-600"
        aria-label="Rating slider"
      />

      {/* Value + descriptor */}
      <div className="mt-1 flex items-baseline justify-center gap-2">
        <span className={cn('font-mono text-lg font-bold', value ? 'text-amber-900' : 'text-amber-700/40')}>
          {value > 0 ? value.toFixed(1) : '0.0'}
        </span>
        <span className="text-sm text-amber-800/70">/ 5.0</span>
        {RATING_WORDS(value) && (
          <span className={cn('text-sm font-semibold', dragging && 'animate-pulse', 'text-amber-700')}>
            {RATING_WORDS(value)}
          </span>
        )}
      </div>
      <p className="mt-1 text-center text-xs text-amber-700/60">
        Drag the slider or tap a star half for half-point ratings
      </p>
    </div>
  );
}
