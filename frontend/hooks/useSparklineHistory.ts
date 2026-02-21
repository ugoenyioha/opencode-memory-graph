'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Maintain a rolling buffer of recent values for sparklines
 */
export function useSparklineHistory(
  currentValue: number | undefined,
  maxLength: number = 12
): number[] {
  const [history, setHistory] = useState<number[]>([]);
  const prevValueRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (currentValue === undefined) return;

    // Only add if value changed (avoid duplicates on re-renders)
    if (prevValueRef.current === currentValue) return;
    prevValueRef.current = currentValue;

    setHistory(prev => {
      const next = [...prev, currentValue];
      return next.slice(-maxLength);
    });
  }, [currentValue, maxLength]);

  return history;
}
