'use client';

import { useRelativeTime, useIsRecent } from '@/hooks';
import { cn } from '@/lib/utils';

interface LiveTimestampProps {
  timestamp: number | undefined | null;
  showSparkle?: boolean;
  sparkleThreshold?: number; // ms, default 60000 (1 minute)
  className?: string;
}

export function LiveTimestamp({
  timestamp,
  showSparkle = false,
  sparkleThreshold = 60000,
  className,
}: LiveTimestampProps) {
  const relativeTime = useRelativeTime(timestamp);
  const isRecent = useIsRecent(timestamp, sparkleThreshold);

  if (!timestamp) return null;

  return (
    <span
      className={cn(
        'text-xs tabular-nums transition-colors duration-300',
        isRecent ? 'text-theme-text-secondary font-medium' : 'text-theme-text-dim',
        className
      )}
      title={new Date(timestamp).toLocaleString()}
    >
      {showSparkle && isRecent && (
        <span className="mr-1 text-theme-accent animate-pulse">✦</span>
      )}
      {relativeTime}
    </span>
  );
}

// Compact version for tight spaces
interface CompactTimestampProps {
  timestamp: number | undefined | null;
  className?: string;
}

export function CompactTimestamp({ timestamp, className }: CompactTimestampProps) {
  const relativeTime = useRelativeTime(timestamp);
  const isRecent = useIsRecent(timestamp, 60000);

  if (!timestamp) return null;

  // Shorten the display for compact mode
  const compact = relativeTime
    .replace(' ago', '')
    .replace('just now', 'now')
    .replace('yesterday', '1d');

  return (
    <span
      className={cn(
        'text-xs tabular-nums',
        isRecent ? 'text-theme-text-muted' : 'text-theme-text-faint',
        className
      )}
      title={new Date(timestamp).toLocaleString()}
    >
      {compact}
    </span>
  );
}
