'use client';

import { cn } from '@/lib/utils';

export interface EmbeddingCoverageBarProps {
  withEmbedding: number;
  total: number;
  coveragePct: number;
  className?: string;
}

export function EmbeddingCoverageBar({
  withEmbedding,
  total,
  coveragePct,
  className,
}: EmbeddingCoverageBarProps) {
  const level =
    coveragePct >= 90 ? 'good' :
    coveragePct >= 50 ? 'warn' :
    'low';

  const barColor = {
    good: 'bg-green-500',
    warn: 'bg-amber-500',
    low: 'bg-red-500',
  }[level];

  const textColor = {
    good: 'text-green-400',
    warn: 'text-amber-400',
    low: 'text-red-400',
  }[level];

  return (
    <div className={cn('bg-theme-bg-tertiary/50 border border-theme-border rounded-lg p-4', className)}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-theme-text-secondary">Embedding Coverage</h3>
        <span className={cn('text-sm font-bold', textColor)}>
          {coveragePct}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-theme-bg-secondary rounded-full overflow-hidden mb-2">
        <div
          className={cn('h-full rounded-full transition-all duration-500', barColor)}
          style={{ width: `${Math.min(coveragePct, 100)}%` }}
        />
      </div>

      <div className="text-xs text-theme-text-dim">
        {withEmbedding.toLocaleString()} / {total.toLocaleString()} entities have embeddings
      </div>
    </div>
  );
}
