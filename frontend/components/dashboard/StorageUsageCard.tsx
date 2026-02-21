'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { StorageMetrics, FilesystemMetrics } from '@/types';

export interface StorageUsageCardProps {
  storage: StorageMetrics;
  filesystem?: FilesystemMetrics;
  className?: string;
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let i = 0;
  let size = bytes;

  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }

  return `${size.toFixed(1)} ${units[i]}`;
}

interface StorageSegment {
  label: string;
  bytes: number;
  color: string;
}

export function StorageUsageCard({ storage, filesystem, className }: StorageUsageCardProps) {
  const { segments, usedPct, turnsTotal, blobsTotal, fsTotal, freeTotal, totalBytes } = useMemo(() => {
    const turnsTotal =
      storage.turns_log_bytes +
      storage.turns_index_bytes +
      storage.turns_meta_bytes +
      storage.heads_table_bytes;

    const blobsTotal = storage.blobs_pack_bytes + storage.blobs_index_bytes;

    const fsTotal = filesystem?.index_bytes ?? 0;

    const freeTotal = storage.data_dir_free_bytes;

    const totalBytes = storage.data_dir_total_bytes;
    const usedBytes = totalBytes - freeTotal;
    const usedPct = (usedBytes / totalBytes) * 100;

    const segments: StorageSegment[] = [
      { label: 'Turns', bytes: turnsTotal, color: 'bg-theme-accent' },
      { label: 'Blobs', bytes: blobsTotal, color: 'bg-blue-500' },
      { label: 'FS', bytes: fsTotal, color: 'bg-amber-500' },
      { label: 'Free', bytes: freeTotal, color: 'bg-theme-bg-hover' },
    ];

    return { segments, usedPct, turnsTotal, blobsTotal, fsTotal, freeTotal, totalBytes };
  }, [storage, filesystem]);

  return (
    <div className={cn('bg-theme-bg-tertiary/50 border border-theme-border rounded-lg p-4', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-theme-text-secondary">Storage</h3>
        <span className="text-sm text-theme-text-muted">{usedPct.toFixed(0)}% used</span>
      </div>

      {/* Stacked bar */}
      <div className="h-3 flex rounded-full overflow-hidden mb-4">
        {segments.map((seg, i) => {
          const pct = (seg.bytes / totalBytes) * 100;
          if (pct < 0.5) return null; // Skip tiny segments
          return (
            <div
              key={i}
              className={cn(seg.color, 'transition-all duration-300')}
              style={{ width: `${pct}%` }}
              title={`${seg.label}: ${formatBytes(seg.bytes)}`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="space-y-1 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-theme-accent" />
          <span className="text-theme-text-muted">{formatBytes(turnsTotal)}</span>
          <span className="text-theme-text-dim">turns (log+idx+meta)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-blue-500" />
          <span className="text-theme-text-muted">{formatBytes(blobsTotal)}</span>
          <span className="text-theme-text-dim">blobs (pack+idx)</span>
        </div>
        {fsTotal > 0 && (
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-amber-500" />
            <span className="text-theme-text-muted">{formatBytes(fsTotal)}</span>
            <span className="text-theme-text-dim">filesystem index</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-theme-bg-hover" />
          <span className="text-theme-text-muted">{formatBytes(freeTotal)}</span>
          <span className="text-theme-text-dim">free</span>
        </div>
      </div>

      {/* Total */}
      <div className="mt-3 pt-3 border-t border-theme-border/50 text-sm text-theme-text-dim">
        Total: {formatBytes(totalBytes)}
      </div>
    </div>
  );
}
