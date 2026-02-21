'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  ChevronDown,
  ChevronRight,
  Hash,
  Clock,
  AlertCircle,
  Copy,
  Check,
} from './icons';

// ============================================================================
// Smart Value Renderer
// ============================================================================

interface ValueRendererProps {
  value: unknown;
  depth?: number;
  maxDepth?: number;
  keyName?: string;
}

function ValueRenderer({ value, depth = 0, maxDepth = 4, keyName }: ValueRendererProps) {
  const [isExpanded, setIsExpanded] = useState(depth < 2);

  if (value === null) {
    return <span className="text-theme-text-dim italic">null</span>;
  }

  if (value === undefined) {
    return <span className="text-theme-text-dim italic">undefined</span>;
  }

  if (typeof value === 'boolean') {
    return (
      <span className={cn('font-mono', value ? 'text-green-400' : 'text-red-400')}>
        {String(value)}
      </span>
    );
  }

  if (typeof value === 'number') {
    // Check if it looks like a timestamp (13 digits = milliseconds since epoch)
    if (keyName && (keyName.includes('timestamp') || keyName.includes('_at') || keyName === 'ts')) {
      const date = new Date(value);
      if (date.getFullYear() > 2020 && date.getFullYear() < 2100) {
        return (
          <span className="font-mono text-cyan-400" title={date.toISOString()}>
            {value}
            <span className="text-theme-text-dim ml-2 text-xs">
              ({date.toLocaleString()})
            </span>
          </span>
        );
      }
    }
    return <span className="font-mono text-amber-400">{value}</span>;
  }

  if (typeof value === 'string') {
    // Check if it's a timestamp string
    if (keyName && (keyName.includes('timestamp') || keyName.includes('_at'))) {
      const num = parseInt(value, 10);
      if (!isNaN(num) && num > 1600000000000 && num < 2000000000000) {
        const date = new Date(num);
        return (
          <span className="font-mono text-cyan-400" title={date.toISOString()}>
            {value}
            <span className="text-theme-text-dim ml-2 text-xs">
              ({date.toLocaleString()})
            </span>
          </span>
        );
      }
    }

    // Check if it looks like JSON
    if ((value.startsWith('{') || value.startsWith('[')) && value.length > 2) {
      try {
        const parsed = JSON.parse(value);
        return (
          <div className="ml-2">
            <ValueRenderer value={parsed} depth={depth + 1} maxDepth={maxDepth} />
          </div>
        );
      } catch {
        // Not valid JSON, render as string
      }
    }

    // Long strings get truncated with expand option
    if (value.length > 200) {
      return (
        <div>
          <span className="text-emerald-400 break-all">
            &quot;{isExpanded ? value : value.slice(0, 200)}
            {!isExpanded && '...'}
            &quot;
          </span>
          {value.length > 200 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="ml-2 text-xs text-theme-text-dim hover:text-theme-text-secondary"
            >
              {isExpanded ? 'less' : `+${value.length - 200} chars`}
            </button>
          )}
        </div>
      );
    }

    // URLs get special treatment
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:underline break-all"
        >
          {value}
        </a>
      );
    }

    // Email addresses
    if (value.includes('@') && value.includes('.')) {
      return <span className="text-violet-400">&quot;{value}&quot;</span>;
    }

    return <span className="text-emerald-400 break-all">&quot;{value}&quot;</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-theme-text-dim">[]</span>;
    }

    if (depth >= maxDepth) {
      return <span className="text-theme-text-dim">[...{value.length} items]</span>;
    }

    return (
      <div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 text-theme-text-muted hover:text-theme-text-secondary"
        >
          {isExpanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
          <span className="text-xs">Array[{value.length}]</span>
        </button>
        {isExpanded && (
          <div className="ml-4 border-l border-theme-border/50 pl-2 space-y-1">
            {value.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <span className="text-theme-text-faint text-xs font-mono min-w-[20px]">{idx}</span>
                <ValueRenderer value={item} depth={depth + 1} maxDepth={maxDepth} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return <span className="text-theme-text-dim">{'{}'}</span>;
    }

    if (depth >= maxDepth) {
      return <span className="text-theme-text-dim">{'{...}'}</span>;
    }

    return (
      <div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 text-theme-text-muted hover:text-theme-text-secondary"
        >
          {isExpanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
          <span className="text-xs">Object{`{${entries.length}}`}</span>
        </button>
        {isExpanded && (
          <div className="ml-4 border-l border-theme-border/50 pl-2 space-y-1">
            {entries.map(([key, val]) => (
              <div key={key} className="flex items-start gap-2">
                <span className="text-sky-400 text-xs font-mono flex-shrink-0">{key}:</span>
                <ValueRenderer value={val} depth={depth + 1} maxDepth={maxDepth} keyName={key} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return <span className="text-theme-text-muted">{String(value)}</span>;
}

// ============================================================================
// Heuristic Type Detection
// ============================================================================

interface DetectedType {
  name: string;
  confidence: 'high' | 'medium' | 'low';
  color: string;
}

function detectType(data: unknown): DetectedType {
  if (!data || typeof data !== 'object') {
    return { name: 'Unknown', confidence: 'low', color: 'text-theme-text-muted' };
  }

  const obj = data as Record<string, unknown>;
  const keys = Object.keys(obj);

  // Check for common patterns
  if ('event_type' in obj && 'quest_id' in obj) {
    return { name: 'Quest Event', confidence: 'high', color: 'text-indigo-400' };
  }

  if ('trigger' in obj && 'file_count' in obj && 'total_bytes' in obj) {
    return { name: 'Quest Snapshot', confidence: 'high', color: 'text-cyan-400' };
  }

  if ('item_type' in obj) {
    return { name: 'Conversation Item', confidence: 'high', color: 'text-purple-400' };
  }

  if ('Role' in obj && 'Parts' in obj) {
    return { name: 'Agent Message', confidence: 'high', color: 'text-violet-400' };
  }

  if ('role' in obj && ('content' in obj || 'parts' in obj)) {
    return { name: 'Chat Message', confidence: 'medium', color: 'text-blue-400' };
  }

  if ('tool_call_id' in obj || 'tool_calls' in obj) {
    return { name: 'Tool Data', confidence: 'medium', color: 'text-amber-400' };
  }

  if ('error' in obj || 'message' in obj && 'code' in obj) {
    return { name: 'Error', confidence: 'medium', color: 'text-red-400' };
  }

  if ('status' in obj || 'state' in obj) {
    return { name: 'Status Update', confidence: 'low', color: 'text-green-400' };
  }

  // Generic object with timestamp looks like an event
  if ('timestamp' in obj || 'created_at' in obj || 'ts' in obj) {
    return { name: 'Event', confidence: 'low', color: 'text-theme-text-secondary' };
  }

  return { name: 'Data Object', confidence: 'low', color: 'text-theme-text-muted' };
}

// ============================================================================
// Key Fields Extractor
// ============================================================================

interface KeyField {
  key: string;
  value: unknown;
  priority: number;
}

function extractKeyFields(data: unknown): KeyField[] {
  if (!data || typeof data !== 'object') return [];

  const obj = data as Record<string, unknown>;
  const fields: KeyField[] = [];

  // Priority fields (higher = more important)
  const priorityMap: Record<string, number> = {
    // Identity
    id: 100,
    name: 95,
    type: 90,
    kind: 90,
    event_type: 90,
    item_type: 90,

    // Content
    text: 85,
    content: 85,
    message: 85,
    description: 80,
    title: 80,

    // Status
    status: 75,
    state: 75,
    error: 75,
    success: 75,

    // User/Actor
    user: 70,
    user_id: 70,
    author: 70,
    role: 70,

    // Time
    timestamp: 60,
    created_at: 60,
    ts: 60,
  };

  for (const [key, value] of Object.entries(obj)) {
    // Skip null/undefined and complex nested objects for key display
    if (value === null || value === undefined) continue;

    const priority = priorityMap[key.toLowerCase()] || 0;
    if (priority > 0 || (typeof value === 'string' && value.length < 100)) {
      fields.push({ key, value, priority });
    }
  }

  // Sort by priority (descending) and take top 5
  return fields.sort((a, b) => b.priority - a.priority).slice(0, 5);
}

// ============================================================================
// Main Fallback Renderer
// ============================================================================

interface FallbackRendererProps {
  data: unknown;
  className?: string;
}

export function FallbackRenderer({ data, className }: FallbackRendererProps) {
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const detectedType = useMemo(() => detectType(data), [data]);
  const keyFields = useMemo(() => extractKeyFields(data), [data]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Ignore
    }
  };

  // Handle empty/null data
  if (data === null || data === undefined) {
    return (
      <div className={cn('text-sm text-theme-text-dim italic', className)}>
        No data
      </div>
    );
  }

  // Handle primitive types
  if (typeof data !== 'object') {
    return (
      <div className={cn('text-sm', className)}>
        <ValueRenderer value={data} />
      </div>
    );
  }

  const obj = data as Record<string, unknown>;
  const isEmpty = Object.keys(obj).length === 0;

  if (isEmpty) {
    return (
      <div className={cn('text-sm text-theme-text-dim italic', className)}>
        Empty object
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Type indicator header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Hash className="w-4 h-4 text-theme-text-dim" />
          <span className={cn('text-sm font-medium', detectedType.color)}>
            {detectedType.name}
          </span>
          {detectedType.confidence !== 'high' && (
            <span className="text-xs text-theme-text-faint">(inferred)</span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-theme-text-dim hover:text-theme-text-secondary transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-green-400" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Key fields summary */}
      {keyFields.length > 0 && (
        <div className="border border-theme-border/50 rounded-lg p-3 bg-theme-bg-tertiary/30 space-y-2">
          {keyFields.map(({ key, value }) => (
            <div key={key} className="flex items-start gap-2 text-sm">
              <span className="text-theme-text-dim min-w-[80px] flex-shrink-0">{key}</span>
              <span className="text-theme-text-secondary break-all">
                {typeof value === 'string' ? (
                  value.length > 100 ? `${value.slice(0, 100)}...` : value
                ) : typeof value === 'boolean' ? (
                  <span className={value ? 'text-green-400' : 'text-red-400'}>
                    {String(value)}
                  </span>
                ) : typeof value === 'number' ? (
                  <span className="text-amber-400 font-mono">{value}</span>
                ) : (
                  <span className="text-theme-text-muted">{JSON.stringify(value)}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Expandable full data view */}
      <div className="border border-theme-border/50 rounded-lg overflow-hidden">
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="w-full px-3 py-2 flex items-center justify-between text-left bg-theme-bg-tertiary/30 hover:bg-theme-bg-tertiary/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            {showRaw ? (
              <ChevronDown className="w-4 h-4 text-theme-text-dim" />
            ) : (
              <ChevronRight className="w-4 h-4 text-theme-text-dim" />
            )}
            <span className="text-xs text-theme-text-muted font-medium">Full Data</span>
          </div>
          <span className="text-[10px] text-theme-text-faint">
            {Object.keys(obj).length} fields
          </span>
        </button>
        {showRaw && (
          <div className="p-3 border-t border-theme-border/50 bg-theme-bg-secondary/50 max-h-[400px] overflow-y-auto">
            <ValueRenderer value={data} />
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// TurnRendererProps Wrapper
// ============================================================================

import type { TurnRendererProps } from '@/lib/renderer-registry';

/**
 * Wrapper that accepts standard TurnRendererProps interface.
 * FallbackRenderer already accepts (data, className), so this is simple.
 */
export function FallbackRendererWrapper({ data, className }: TurnRendererProps) {
  return <FallbackRenderer data={data} className={className} />;
}

// ============================================================================
// Export type detector for external use
// ============================================================================

export { detectType };
