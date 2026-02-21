'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

export type PresenceState = 'live' | 'active' | 'idle' | 'disconnected';

interface PresenceIndicatorProps {
  state: PresenceState;
  size?: 'sm' | 'md' | 'lg';
  showRing?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3',
};

const ringClasses = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

export function PresenceIndicator({
  state,
  size = 'md',
  showRing = false,
  className,
}: PresenceIndicatorProps) {
  const stateStyles = useMemo(() => {
    switch (state) {
      case 'live':
        return {
          dot: 'bg-theme-live-green animate-breathe',
          ring: 'bg-theme-live-glow',
          glow: 'shadow-[0_0_8px_2px_var(--theme-live-glow)]',
        };
      case 'active':
        return {
          dot: 'bg-theme-live-green animate-pulse-once',
          ring: 'bg-theme-live-glow-strong',
          glow: 'shadow-[0_0_12px_4px_var(--theme-live-glow-strong)]',
        };
      case 'idle':
        return {
          dot: 'bg-theme-text-dim',
          ring: 'bg-theme-text-dim/20',
          glow: '',
        };
      case 'disconnected':
        return {
          dot: 'bg-theme-text-dim opacity-50',
          ring: 'bg-theme-text-dim/10',
          glow: '',
        };
    }
  }, [state]);

  return (
    <div
      className={cn(
        'relative inline-flex items-center justify-center',
        showRing ? ringClasses[size] : sizeClasses[size],
        className
      )}
      aria-label={`Status: ${state}`}
    >
      {showRing && (
        <div
          className={cn(
            'absolute inset-0 rounded-full transition-colors duration-300',
            stateStyles.ring
          )}
        />
      )}
      <div
        className={cn(
          'rounded-full transition-all duration-300',
          sizeClasses[size],
          stateStyles.dot,
          stateStyles.glow
        )}
      />
    </div>
  );
}

// Convenience component for showing presence with a label
interface PresenceBadgeProps {
  state: PresenceState;
  label?: string;
  className?: string;
}

export function PresenceBadge({ state, label, className }: PresenceBadgeProps) {
  const stateLabel = label || state;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium',
        state === 'live' || state === 'active' ? 'text-theme-live-green' : 'text-theme-text-dim',
        className
      )}
    >
      <PresenceIndicator state={state} size="sm" />
      <span className="capitalize">{stateLabel}</span>
    </div>
  );
}
