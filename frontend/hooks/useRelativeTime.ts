'use client';

import { useState, useEffect, useMemo } from 'react';

/**
 * Format a timestamp as a relative time string
 */
export function formatRelativeTime(timestamp: number): string {
  const delta = Date.now() - timestamp;

  if (delta < 0) return 'in the future';
  if (delta < 5000) return 'just now';
  if (delta < 60000) return `${Math.floor(delta / 1000)}s ago`;
  if (delta < 3600000) return `${Math.floor(delta / 60000)}m ago`;
  if (delta < 86400000) return `${Math.floor(delta / 3600000)}h ago`;

  const days = Math.floor(delta / 86400000);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

/**
 * Get the appropriate update interval based on how old the timestamp is
 */
function getUpdateInterval(timestamp: number): number {
  const delta = Date.now() - timestamp;

  if (delta < 60000) return 1000; // Every second for <1m
  if (delta < 3600000) return 60000; // Every minute for <1h
  if (delta < 86400000) return 3600000; // Every hour for <24h
  return 86400000; // Every day for older
}

/**
 * Hook that returns a live-updating relative time string
 */
export function useRelativeTime(timestamp: number | undefined | null): string {
  const [display, setDisplay] = useState(() =>
    timestamp ? formatRelativeTime(timestamp) : ''
  );

  useEffect(() => {
    if (!timestamp) {
      setDisplay('');
      return;
    }

    // Update immediately
    setDisplay(formatRelativeTime(timestamp));

    // Set up interval for updates
    let intervalId: NodeJS.Timeout;

    const scheduleUpdate = () => {
      const interval = getUpdateInterval(timestamp);
      intervalId = setTimeout(() => {
        setDisplay(formatRelativeTime(timestamp));
        scheduleUpdate();
      }, interval);
    };

    scheduleUpdate();

    return () => {
      if (intervalId) clearTimeout(intervalId);
    };
  }, [timestamp]);

  return display;
}

/**
 * Hook that returns whether a timestamp is "recent" (within threshold)
 */
export function useIsRecent(
  timestamp: number | undefined | null,
  thresholdMs = 60000
): boolean {
  const [isRecent, setIsRecent] = useState(() =>
    timestamp ? Date.now() - timestamp < thresholdMs : false
  );

  useEffect(() => {
    if (!timestamp) {
      setIsRecent(false);
      return;
    }

    const checkRecent = () => {
      setIsRecent(Date.now() - timestamp < thresholdMs);
    };

    checkRecent();
    const intervalId = setInterval(checkRecent, 1000);

    return () => clearInterval(intervalId);
  }, [timestamp, thresholdMs]);

  return isRecent;
}

/**
 * Formats duration in milliseconds to a human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

/**
 * Hook for an incrementing duration counter (for "running" states)
 */
export function useLiveDuration(startTime: number | undefined | null): string {
  const [duration, setDuration] = useState('');

  useEffect(() => {
    if (!startTime) {
      setDuration('');
      return;
    }

    const update = () => {
      setDuration(formatDuration(Date.now() - startTime));
    };

    update();
    const intervalId = setInterval(update, 100); // Update every 100ms for smooth counter

    return () => clearInterval(intervalId);
  }, [startTime]);

  return duration;
}
