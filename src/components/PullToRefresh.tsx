import type { ReactNode } from 'react';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { PullToRefreshIndicator } from '@/components/PullToRefreshIndicator';

export interface PullToRefreshProps {
  /** Refresh callback — e.g. `() => queryClient.invalidateQueries(...)`. */
  onRefresh?: () => Promise<unknown>;
  children: ReactNode;
}

/**
 * Wrapper that adds the custom pull-to-refresh gesture to any page surface
 * (Profile, BeerDetail, …). The indicator layers absolutely over the top
 * edge; children keep their normal scroll/tap behavior and the wrapper
 * stays pointer-transparent except for the deliberate downward pull.
 */
export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const { containerRef, indicatorRef } = usePullToRefresh({ onRefresh });
  return (
    <div
      ref={containerRef}
      className="relative"
      style={{ overscrollBehavior: 'contain' }}
    >
      <PullToRefreshIndicator ref={indicatorRef} />
      {children}
    </div>
  );
}
