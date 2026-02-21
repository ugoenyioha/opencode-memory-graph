'use client';

import { cn } from '@/lib/utils';
import type { DeadLetterItem } from '@/hooks/useQueueHealth';

export interface DeadLetterTableProps {
  items: DeadLetterItem[];
  total: number;
  onRetry: (uuid: string) => void;
  onRetryAll: () => void;
  onPurge: () => void;
  className?: string;
}

function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function DeadLetterTable({
  items,
  total,
  onRetry,
  onRetryAll,
  onPurge,
  className,
}: DeadLetterTableProps) {
  if (total === 0) return null;

  return (
    <div className={cn('bg-theme-bg-tertiary/50 border border-red-500/30 rounded-lg p-4', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-red-400">
          Dead Letters ({total})
        </h3>
        <div className="flex gap-2">
          <button
            onClick={onRetryAll}
            className="px-3 py-1 text-xs bg-amber-900/30 border border-amber-500/30 text-amber-400 rounded hover:bg-amber-900/50 transition-colors"
          >
            Retry All
          </button>
          <button
            onClick={onPurge}
            className="px-3 py-1 text-xs bg-red-900/30 border border-red-500/30 text-red-400 rounded hover:bg-red-900/50 transition-colors"
          >
            Purge All
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-theme-text-dim border-b border-theme-border/50">
              <th className="text-left py-2 pr-3">Session</th>
              <th className="text-left py-2 pr-3">Error</th>
              <th className="text-right py-2 pr-3">Attempts</th>
              <th className="text-right py-2 pr-3">Failed At</th>
              <th className="text-right py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.uuid} className="border-b border-theme-border/20 hover:bg-theme-bg-tertiary/80">
                <td className="py-2 pr-3 font-mono text-theme-text-secondary">
                  {item.session_id.slice(0, 12)}:{item.message_id.slice(0, 8)}
                </td>
                <td className="py-2 pr-3 text-red-400 max-w-[200px] truncate" title={item.error ?? ''}>
                  {item.error ?? 'unknown'}
                </td>
                <td className="py-2 pr-3 text-right text-theme-text-muted">
                  {item.attempts}
                </td>
                <td className="py-2 pr-3 text-right text-theme-text-dim">
                  {formatTime(item.updated_at)}
                </td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => onRetry(item.uuid)}
                    className="px-2 py-0.5 text-xs text-amber-400 border border-amber-500/30 rounded hover:bg-amber-900/30 transition-colors"
                  >
                    Retry
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
