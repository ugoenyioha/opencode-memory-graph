'use client';

import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FollowIndicatorProps {
  isPaused: boolean;
  onResume: () => void;
  className?: string;
}

export function FollowIndicator({ isPaused, onResume, className }: FollowIndicatorProps) {
  if (!isPaused) return null;

  return (
    <div
      className={cn(
        'absolute bottom-4 left-1/2 -translate-x-1/2 z-10',
        'animate-slide-up',
        className
      )}
    >
      <button
        onClick={onResume}
        className={cn(
          'flex items-center gap-2 px-4 py-2',
          'bg-theme-bg-tertiary/90 backdrop-blur-sm',
          'border border-theme-border rounded-full',
          'text-sm text-theme-text-secondary',
          'hover:bg-theme-bg-hover/90 hover:text-white',
          'hover:border-theme-accent/50',
          'transition-all duration-200',
          'shadow-lg shadow-black/20',
          'group'
        )}
      >
        <ChevronDown
          size={16}
          className="text-theme-accent group-hover:animate-bounce"
        />
        <span>Resume following</span>
        <kbd className="ml-1 px-1.5 py-0.5 text-[10px] bg-theme-bg-secondary rounded border border-theme-text-faint">
          F
        </kbd>
      </button>
    </div>
  );
}

// Minimal version (just an arrow)
interface MinimalFollowIndicatorProps {
  isPaused: boolean;
  onResume: () => void;
  newItemCount?: number;
  className?: string;
}

export function MinimalFollowIndicator({
  isPaused,
  onResume,
  newItemCount = 0,
  className,
}: MinimalFollowIndicatorProps) {
  if (!isPaused) return null;

  return (
    <button
      onClick={onResume}
      className={cn(
        'absolute bottom-4 right-4 z-10',
        'flex items-center justify-center',
        'w-10 h-10 rounded-full',
        'bg-theme-accent hover:bg-theme-accent-dim',
        'text-white shadow-lg shadow-theme-accent/30',
        'transition-all duration-200 hover:scale-110',
        'animate-slide-up',
        className
      )}
      title="Resume following (F)"
    >
      <ChevronDown size={20} />
      {newItemCount > 0 && (
        <span className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center bg-red-500 rounded-full text-[10px] font-bold">
          {newItemCount > 9 ? '9+' : newItemCount}
        </span>
      )}
    </button>
  );
}
