'use client';

import { cn } from '@/lib/utils';
import type { QueueStats } from '@/hooks/useQueueHealth';

export interface QueueHealthCardProps {
  stats: QueueStats;
  className?: string;
}

function StatusDot({ color }: { color: string }) {
  return <span className={cn('inline-block w-2 h-2 rounded-full', color)} />;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function formatAge(epochMs: number): string {
  const ago = Date.now() - epochMs;
  if (ago < 60_000) return `${Math.round(ago / 1000)}s ago`;
  if (ago < 3_600_000) return `${Math.round(ago / 60_000)}m ago`;
  return `${Math.round(ago / 3_600_000)}h ago`;
}

export function QueueHealthCard({ stats, className }: QueueHealthCardProps) {
  const hasFailures = stats.failed > 0;
  const hasBacklog = stats.pending > 10;

  return (
    <div className={cn(
      'bg-theme-bg-tertiary/50 border rounded-lg p-4',
      hasFailures ? 'border-red-500/40' : hasBacklog ? 'border-amber-500/30' : 'border-theme-border',
      className,
    )}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-theme-text-secondary">Extraction Queue</h3>
        <span className="text-xs text-theme-text-dim">{stats.total} total</span>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <StatusDot color="bg-amber-400" />
            <span className="text-lg font-bold text-theme-text">{stats.pending}</span>
          </div>
          <div className="text-xs text-theme-text-dim">pending</div>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <StatusDot color="bg-blue-400" />
            <span className="text-lg font-bold text-theme-text">{stats.processing}</span>
          </div>
          <div className="text-xs text-theme-text-dim">processing</div>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <StatusDot color="bg-green-400" />
            <span className="text-lg font-bold text-theme-text">{stats.done}</span>
          </div>
          <div className="text-xs text-theme-text-dim">done</div>
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <StatusDot color={hasFailures ? 'bg-red-400' : 'bg-theme-text-dim'} />
            <span className={cn('text-lg font-bold', hasFailures ? 'text-red-400' : 'text-theme-text')}>
              {stats.failed}
            </span>
          </div>
          <div className="text-xs text-theme-text-dim">failed</div>
        </div>
      </div>

      <div className="pt-3 border-t border-theme-border/50 space-y-1">
        {stats.avg_processing_ms != null && (
          <div className="text-xs text-theme-text-muted">
            Avg processing: {formatDuration(stats.avg_processing_ms)}
          </div>
        )}
        {stats.oldest_pending_at != null && (
          <div className="text-xs text-theme-text-muted">
            Oldest pending: {formatAge(stats.oldest_pending_at)}
          </div>
        )}
      </div>
    </div>
  );
}
