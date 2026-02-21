'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle, AlertOctagon } from '@/components/icons';

export interface MemoryPressureGaugeProps {
  pressureRatio: number;
  pressureLevel: 'OK' | 'WARN' | 'HOT' | 'CRITICAL';
  rssBytes: number;
  budgetBytes: number;
  budgetPct: number;
  spillThresholdBytes: number;
  spillCriticalBytes: number;
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

export function MemoryPressureGauge({
  pressureRatio,
  pressureLevel,
  rssBytes,
  budgetBytes,
  budgetPct,
  spillThresholdBytes,
  spillCriticalBytes,
  className,
}: MemoryPressureGaugeProps) {
  // Calculate arc parameters
  const gaugeConfig = useMemo(() => {
    const cx = 150;
    const cy = 120;
    const radius = 100;
    const startAngle = Math.PI; // 180 degrees (left)
    const endAngle = 0; // 0 degrees (right)
    const angleRange = startAngle - endAngle;

    // Zone boundaries (as ratios) - using CSS variable colors
    const zones = [
      { end: 0.60, color: 'var(--theme-gauge-ok)' }, // OK - green
      { end: 0.80, color: 'var(--theme-gauge-warn)' }, // WARN - yellow
      { end: 0.92, color: 'var(--theme-gauge-hot)' }, // HOT - orange
      { end: 1.0, color: 'var(--theme-gauge-critical)' },  // CRITICAL - red
    ];

    // Calculate the fill angle based on pressure ratio (capped at 1.0)
    const fillRatio = Math.min(pressureRatio, 1.0);
    const fillAngle = startAngle - fillRatio * angleRange;

    // Arc path generator
    const describeArc = (startA: number, endA: number) => {
      const x1 = cx + radius * Math.cos(startA);
      const y1 = cy - radius * Math.sin(startA);
      const x2 = cx + radius * Math.cos(endA);
      const y2 = cy - radius * Math.sin(endA);
      const largeArc = startA - endA > Math.PI ? 1 : 0;
      return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
    };

    // Generate zone arcs
    let prevEnd = 0;
    const zoneArcs = zones.map((zone) => {
      const startA = startAngle - prevEnd * angleRange;
      const endA = startAngle - zone.end * angleRange;
      prevEnd = zone.end;
      return {
        path: describeArc(startA, endA),
        color: zone.color,
      };
    });

    // Fill arc (current pressure)
    const fillPath = fillRatio > 0.01
      ? describeArc(startAngle, fillAngle)
      : '';

    return {
      cx,
      cy,
      radius,
      zoneArcs,
      fillPath,
      fillRatio,
    };
  }, [pressureRatio]);

  const showSpillWarning = rssBytes >= spillThresholdBytes && rssBytes < spillCriticalBytes;
  const showCriticalWarning = rssBytes >= spillCriticalBytes;

  const levelColor = {
    OK: 'text-theme-gauge-ok',
    WARN: 'text-theme-gauge-warn',
    HOT: 'text-theme-gauge-hot',
    CRITICAL: 'text-theme-gauge-critical',
  }[pressureLevel];

  return (
    <div className={cn('flex flex-col items-center', className)}>
      {/* Warning banners */}
      {showCriticalWarning && (
        <div className="mb-4 px-4 py-2 bg-red-900/30 border border-red-500/50 rounded-lg flex items-center gap-2 text-red-400">
          <AlertOctagon className="w-5 h-5 shrink-0" />
          <div>
            <div className="font-semibold">CRITICAL MEMORY PRESSURE</div>
            <div className="text-sm text-red-400/80">RSS at {(pressureRatio * 100).toFixed(0)}% of budget. System may become unstable.</div>
          </div>
        </div>
      )}
      {showSpillWarning && !showCriticalWarning && (
        <div className="mb-4 px-4 py-2 bg-amber-900/30 border border-amber-500/50 rounded-lg flex items-center gap-2 text-amber-400">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <div>
            <div className="font-semibold">SPILL RECOMMENDED</div>
            <div className="text-sm text-amber-400/80">RSS exceeds 85% of budget. Consider enabling spill-to-disk.</div>
          </div>
        </div>
      )}

      {/* Center label */}
      <div className="text-center mb-2">
        <div className={cn('text-3xl font-bold', levelColor)}>
          {(pressureRatio * 100).toFixed(0)}%
        </div>
        <div className="text-sm text-theme-text-muted">
          {formatBytes(rssBytes)} of {formatBytes(budgetBytes)}
        </div>
      </div>

      {/* SVG Gauge */}
      <svg width="300" height="140" className="overflow-visible">
        {/* Background zone arcs */}
        {gaugeConfig.zoneArcs.map((zone, i) => (
          <path
            key={i}
            d={zone.path}
            fill="none"
            stroke={zone.color}
            strokeWidth="20"
            strokeLinecap="butt"
            opacity={0.2}
          />
        ))}

        {/* Fill arc */}
        {gaugeConfig.fillPath && (
          <path
            d={gaugeConfig.fillPath}
            fill="none"
            stroke={
              pressureLevel === 'OK' ? 'var(--theme-gauge-ok)' :
              pressureLevel === 'WARN' ? 'var(--theme-gauge-warn)' :
              pressureLevel === 'HOT' ? 'var(--theme-gauge-hot)' :
              'var(--theme-gauge-critical)'
            }
            strokeWidth="20"
            strokeLinecap="round"
            className="transition-all duration-500 ease-out"
          />
        )}

        {/* Threshold labels */}
        <text x="70" y="135" className="fill-theme-text-dim text-xs">60%</text>
        <text x="135" y="135" className="fill-theme-text-dim text-xs">80%</text>
        <text x="200" y="135" className="fill-theme-text-dim text-xs">92%</text>
      </svg>

      {/* Budget annotation */}
      <div className="text-xs text-theme-text-dim mt-2">
        Budget: {formatBytes(budgetBytes)} ({(budgetPct * 100).toFixed(0)}% of available)
      </div>
    </div>
  );
}
