'use client';

import { useMemo } from 'react';

export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export function Sparkline({
  values,
  width = 64,
  height = 16,
  color = 'currentColor',
  className,
}: SparklineProps) {
  const points = useMemo(() => {
    if (values.length < 2) return '';

    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;

    return values
      .map((v, i) => {
        const x = (i / (values.length - 1)) * width;
        const y = height - ((v - min) / range) * (height - 2) - 1;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [values, width, height]);

  if (values.length < 2) {
    return (
      <svg width={width} height={height} className={className}>
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke={color}
          strokeWidth="1"
          strokeDasharray="2,2"
          opacity={0.3}
        />
      </svg>
    );
  }

  return (
    <svg width={width} height={height} className={className}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
