'use client';

import { Loader2, Wifi, WifiOff } from 'lucide-react';
import type { ConnectionState } from '@/types';
import { cn } from '@/lib/utils';

interface ConnectionStatusProps {
  state: ConnectionState;
  variant?: 'dot' | 'icon' | 'badge';
  className?: string;
}

export function ConnectionStatus({
  state,
  variant = 'dot',
  className,
}: ConnectionStatusProps) {
  if (variant === 'dot') {
    return <ConnectionDot state={state} className={className} />;
  }

  if (variant === 'icon') {
    return <ConnectionIcon state={state} className={className} />;
  }

  return <ConnectionBadge state={state} className={className} />;
}

// Dot variant - ambient indicator
function ConnectionDot({
  state,
  className,
}: {
  state: ConnectionState;
  className?: string;
}) {
  const styles = {
    connecting: 'bg-theme-warning-yellow animate-pulse',
    connected: 'bg-theme-live-green animate-breathe',
    reconnecting: 'bg-theme-warning-yellow animate-spin-slow',
    disconnected: 'bg-theme-text-dim',
  };

  return (
    <div
      className={cn(
        'w-2 h-2 rounded-full transition-colors duration-300',
        styles[state],
        state === 'connected' && 'shadow-[0_0_6px_2px_rgba(34,197,94,0.3)]',
        className
      )}
      aria-label={`Connection: ${state}`}
      title={`Connection: ${state}`}
    />
  );
}

// Icon variant - more explicit
function ConnectionIcon({
  state,
  className,
}: {
  state: ConnectionState;
  className?: string;
}) {
  const iconProps = { size: 16, className: cn('transition-colors duration-300', className) };

  switch (state) {
    case 'connecting':
      return (
        <Loader2
          {...iconProps}
          className={cn(iconProps.className, 'text-theme-warning-yellow animate-spin')}
        />
      );
    case 'connected':
      return (
        <Wifi {...iconProps} className={cn(iconProps.className, 'text-theme-live-green')} />
      );
    case 'reconnecting':
      return (
        <Loader2
          {...iconProps}
          className={cn(iconProps.className, 'text-theme-warning-yellow animate-spin')}
        />
      );
    case 'disconnected':
      return (
        <WifiOff {...iconProps} className={cn(iconProps.className, 'text-theme-text-dim')} />
      );
  }
}

// Badge variant - text label
function ConnectionBadge({
  state,
  className,
}: {
  state: ConnectionState;
  className?: string;
}) {
  const styles = {
    connecting: 'bg-theme-warning-muted text-theme-warning border-theme-warning/30',
    connected: 'bg-theme-success-muted text-theme-live-green border-theme-live-green/30',
    reconnecting: 'bg-theme-warning-muted text-theme-warning border-theme-warning/30',
    disconnected: 'bg-theme-tag-default-bg text-theme-text-muted border-theme-border',
  };

  const labels = {
    connecting: 'Connecting...',
    connected: 'Live',
    reconnecting: 'Reconnecting...',
    disconnected: 'Offline',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5',
        'text-xs font-medium rounded-full border',
        styles[state],
        className
      )}
    >
      <ConnectionDot state={state} className="w-1.5 h-1.5" />
      {labels[state]}
    </span>
  );
}

// Ambient glow for container elements
interface LiveGlowProps {
  isLive: boolean;
  children: React.ReactNode;
  className?: string;
}

export function LiveGlow({ isLive, children, className }: LiveGlowProps) {
  return (
    <div
      className={cn(
        'transition-shadow duration-500',
        isLive && 'animate-glow-pulse',
        className
      )}
    >
      {children}
    </div>
  );
}
