'use client';

import { cn } from '@/lib/utils';
import { Sparkline } from './Sparkline';
import type { PerfMetrics } from '@/types';

export interface PerformanceCardProps {
  perf: PerfMetrics;
  appendHistory: number[];
  getLastHistory: number[];
  httpHistory: number[];
  className?: string;
}

type LatencyLevel = 'good' | 'acceptable' | 'concerning';

function getLatencyLevel(metric: string, value: number): LatencyLevel {
  const thresholds: Record<string, { good: number; acceptable: number }> = {
    append: { good: 5, acceptable: 15 },
    get_last: { good: 3, acceptable: 10 },
    get_blob: { good: 2, acceptable: 5 },
  };

  const threshold = thresholds[metric] || { good: 5, acceptable: 15 };

  if (value <= threshold.good) return 'good';
  if (value <= threshold.acceptable) return 'acceptable';
  return 'concerning';
}

const latencyColors: Record<LatencyLevel, string> = {
  good: 'text-emerald-400',
  acceptable: 'text-yellow-400',
  concerning: 'text-red-400',
};

export function PerformanceCard({
  perf,
  appendHistory,
  getLastHistory,
  httpHistory,
  className,
}: PerformanceCardProps) {
  return (
    <div className={cn('bg-theme-bg-tertiary/50 border border-theme-border rounded-lg p-4', className)}>
      <h3 className="text-sm font-medium text-theme-text-secondary mb-4">Performance</h3>

      {/* Throughput section */}
      <div className="mb-4">
        <div className="text-xs text-theme-text-dim uppercase tracking-wide mb-2">Throughput (1m avg)</div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-theme-text-muted">append</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-theme-text-secondary font-mono">
                {perf.append_tps_1m.toFixed(1)} tps
              </span>
              <Sparkline values={appendHistory} color="#a855f7" className="opacity-70" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-theme-text-muted">get_last</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-theme-text-secondary font-mono">
                {perf.get_last_tps_1m.toFixed(1)} tps
              </span>
              <Sparkline values={getLastHistory} color="#3b82f6" className="opacity-70" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-theme-text-muted">http</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-theme-text-secondary font-mono">
                {perf.http_req_tps_1m.toFixed(1)} req/s
              </span>
              <Sparkline values={httpHistory} color="#22c55e" className="opacity-70" />
            </div>
          </div>
        </div>
      </div>

      {/* Latency section */}
      <div>
        <div className="text-xs text-theme-text-dim uppercase tracking-wide mb-2">Latency (p95)</div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-theme-text-muted">append</span>
            <span
              className={cn(
                'text-sm font-mono',
                perf.append_latency_ms.p95 != null
                  ? latencyColors[getLatencyLevel('append', perf.append_latency_ms.p95)]
                  : 'text-theme-text-dim'
              )}
            >
              {perf.append_latency_ms.p95 != null ? `${perf.append_latency_ms.p95.toFixed(1)} ms` : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-theme-text-muted">get_last</span>
            <span
              className={cn(
                'text-sm font-mono',
                perf.get_last_latency_ms.p95 != null
                  ? latencyColors[getLatencyLevel('get_last', perf.get_last_latency_ms.p95)]
                  : 'text-theme-text-dim'
              )}
            >
              {perf.get_last_latency_ms.p95 != null ? `${perf.get_last_latency_ms.p95.toFixed(1)} ms` : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-theme-text-muted">get_blob</span>
            <span
              className={cn(
                'text-sm font-mono',
                perf.get_blob_latency_ms.p95 != null
                  ? latencyColors[getLatencyLevel('get_blob', perf.get_blob_latency_ms.p95)]
                  : 'text-theme-text-dim'
              )}
            >
              {perf.get_blob_latency_ms.p95 != null ? `${perf.get_blob_latency_ms.p95.toFixed(1)} ms` : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
