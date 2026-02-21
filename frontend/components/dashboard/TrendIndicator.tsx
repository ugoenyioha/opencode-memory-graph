'use client';

import { cn } from '@/lib/utils';

export type Trend = 'rising' | 'stable' | 'falling';

export interface TrendIndicatorProps {
  current: number;
  previous?: number;
  className?: string;
}

export function getTrend(current: number, previous?: number): Trend {
  if (previous === undefined || previous === 0) return 'stable';

  const delta = current - previous;
  const pct = Math.abs(delta / previous);

  if (pct < 0.01) return 'stable'; // <1% change
  return delta > 0 ? 'rising' : 'falling';
}

export function TrendIndicator({ current, previous, className }: TrendIndicatorProps) {
  const trend = getTrend(current, previous);

  return (
    <span
      className={cn(
        'text-sm',
        trend === 'rising' && 'text-emerald-400',
        trend === 'stable' && 'text-theme-text-dim',
        trend === 'falling' && 'text-amber-400',
        className
      )}
      title={
        previous !== undefined
          ? `Previous: ${previous.toLocaleString()}`
          : 'No previous value'
      }
    >
      {trend === 'rising' && '↗'}
      {trend === 'stable' && '→'}
      {trend === 'falling' && '↘'}
    </span>
  );
}
