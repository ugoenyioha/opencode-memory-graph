'use client';

import { cn } from '@/lib/utils';
import { Folder } from '@/components/icons';
import type { FilesystemMetrics } from '@/types';

export interface FilesystemCardProps {
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

export function FilesystemCard({ filesystem, className }: FilesystemCardProps) {
  // Don't render if no filesystem data
  if (!filesystem) return null;

  const avgContentPerSnapshot = filesystem.snapshots_total > 0
    ? filesystem.content_bytes / filesystem.snapshots_total
    : 0;

  return (
    <div className={cn('bg-theme-bg-tertiary/50 border border-theme-border rounded-lg p-4', className)}>
      <div className="flex items-center gap-2 mb-4">
        <Folder className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-medium text-theme-text-secondary">Filesystem Snapshots</h3>
      </div>

      {/* Main metrics */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-theme-text">
            {filesystem.snapshots_total.toLocaleString()}
          </div>
          <div className="text-xs text-theme-text-dim">snapshots</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-theme-text">
            {formatBytes(filesystem.content_bytes)}
          </div>
          <div className="text-xs text-theme-text-dim">blob content</div>
        </div>
      </div>

      {/* Additional details */}
      <div className="pt-3 border-t border-theme-border/50 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-theme-text-muted">index size</span>
          <span className="text-theme-text-secondary font-mono">{formatBytes(filesystem.index_bytes)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-theme-text-muted">avg content per snapshot</span>
          <span className="text-theme-text-secondary font-mono">{formatBytes(avgContentPerSnapshot)}</span>
        </div>
      </div>
    </div>
  );
}
