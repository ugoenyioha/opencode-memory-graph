'use client';

import { cn } from '@/lib/utils';

interface StreamingCursorProps {
  className?: string;
}

export function StreamingCursor({ className }: StreamingCursorProps) {
  return (
    <span
      className={cn(
        'inline-block w-2 h-[1.2em] bg-theme-accent animate-cursor-blink',
        'align-text-bottom ml-0.5',
        className
      )}
      aria-label="Streaming in progress"
    />
  );
}

interface StreamingBadgeProps {
  className?: string;
}

export function StreamingBadge({ className }: StreamingBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5',
        'text-xs font-medium rounded-full',
        'bg-theme-accent-muted text-theme-accent border border-theme-accent/30',
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-theme-accent animate-pulse" />
      streaming
    </span>
  );
}

interface StreamingProgressProps {
  className?: string;
}

export function StreamingProgress({ className }: StreamingProgressProps) {
  return (
    <div className={cn('h-1 w-full bg-theme-bg-tertiary rounded-full overflow-hidden', className)}>
      <div
        className="h-full w-1/3 bg-theme-accent rounded-full animate-progress-indeterminate"
      />
    </div>
  );
}

interface ToolRunningIndicatorProps {
  toolName: string;
  duration?: string;
  className?: string;
}

export function ToolRunningIndicator({
  toolName,
  duration,
  className,
}: ToolRunningIndicatorProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
      <span className="text-xs text-amber-400">
        {toolName} running
        {duration && (
          <span className="ml-1 font-mono text-amber-500">({duration})</span>
        )}
      </span>
    </div>
  );
}

interface ThinkingDotsProps {
  className?: string;
}

export function ThinkingDots({ className }: ThinkingDotsProps) {
  return (
    <span className={cn('inline-flex gap-1', className)}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-theme-accent animate-bounce"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}
