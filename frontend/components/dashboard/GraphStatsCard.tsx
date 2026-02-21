'use client';

import { cn } from '@/lib/utils';

export interface GraphStats {
  entities: {
    total: number;
    by_type: Record<string, number>;
    by_scope: Record<string, number>;
  };
  relationships: {
    total: number;
  };
  embeddings: {
    with_embedding: number;
    total: number;
    coverage_pct: number;
  };
  quarantine: {
    total: number;
  };
}

export interface GraphStatsCardProps {
  stats: GraphStats;
  className?: string;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function GraphStatsCard({ stats, className }: GraphStatsCardProps) {
  const topTypes = Object.entries(stats.entities.by_type)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);

  const density = stats.entities.total > 0
    ? (stats.relationships.total / stats.entities.total).toFixed(1)
    : '0';

  return (
    <div className={cn('bg-theme-bg-tertiary/50 border border-theme-border rounded-lg p-4', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-theme-text-secondary">Knowledge Graph</h3>
        <span className="text-xs text-theme-text-dim">
          {formatCount(stats.entities.total)} entities
        </span>
      </div>

      {/* Main counts */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-theme-text">
            {formatCount(stats.entities.total)}
          </div>
          <div className="text-xs text-theme-text-dim">entities</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-theme-text">
            {formatCount(stats.relationships.total)}
          </div>
          <div className="text-xs text-theme-text-dim">relationships</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-theme-text">{density}</div>
          <div className="text-xs text-theme-text-dim">density</div>
        </div>
      </div>

      {/* Entity type breakdown */}
      {topTypes.length > 0 && (
        <div className="pt-3 border-t border-theme-border/50">
          <div className="flex flex-wrap gap-2">
            {topTypes.map(([type, count]) => (
              <span
                key={type}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-theme-bg-secondary/60 rounded text-xs text-theme-text-muted"
              >
                <span className="font-medium text-theme-text-secondary">{type}</span>
                <span>{count}</span>
              </span>
            ))}
          </div>
          {stats.quarantine.total > 0 && (
            <div className="mt-2 text-xs text-amber-400">
              {stats.quarantine.total} quarantined
            </div>
          )}
        </div>
      )}
    </div>
  );
}
