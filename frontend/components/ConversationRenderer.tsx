'use client';

import { useState } from 'react';
import type {
  ConversationItem,
  ItemType,
  ItemStatus,
  UserInput,
  Assistant,
  AssistantTurn,
  ToolCallItem,
  ToolCallData,
  ToolResultData,
  SystemMessage,
  HandoffInfo,
  ToolCallStatus,
} from '@/types/conversation';
import {
  isConversationItem,
  getItemTypeLabel,
  getItemTypeColors,
  getStatusIndicator,
  getToolCallStatusIndicator,
  getToolStyle,
  formatToolArgs,
} from '@/types/conversation';
import { cn } from '@/lib/utils';
import {
  MessageSquare,
  Layers,
  Wrench,
  Terminal,
  AlertCircle,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  ArrowRight,
} from './icons';

// ============================================================================
// Type Icon Component
// ============================================================================

function ItemTypeIcon({ itemType, className }: { itemType: ItemType; className?: string }) {
  switch (itemType) {
    case 'user_input':
      return <MessageSquare className={className} />;
    case 'assistant_turn':
    case 'assistant':
      return <Layers className={className} />;
    case 'tool_call':
      return <Wrench className={className} />;
    case 'tool_result':
      return <Terminal className={className} />;
    case 'system':
      return <AlertCircle className={className} />;
    case 'handoff':
      return <ArrowRight className={className} />;
    default:
      return <Layers className={className} />;
  }
}

// ============================================================================
// Status Indicator Component
// ============================================================================

function StatusIndicator({ status }: { status?: ItemStatus }) {
  const { icon, color, animate } = getStatusIndicator(status);

  if (icon === 'streaming') {
    return (
      <span className={cn('inline-flex items-center', color)}>
        <Loader2 className={cn('w-3 h-3', animate && 'animate-spin')} />
      </span>
    );
  }

  if (icon === 'pending') {
    return (
      <span className={cn('w-2 h-2 rounded-full bg-current', color, animate && 'animate-pulse')} />
    );
  }

  if (icon === 'error') {
    return <XCircle className={cn('w-3.5 h-3.5', color)} />;
  }

  if (icon === 'cancelled') {
    return <XCircle className={cn('w-3.5 h-3.5', color)} />;
  }

  // complete
  return <CheckCircle className={cn('w-3.5 h-3.5', color)} />;
}

// ============================================================================
// Tool Call Status Indicator
// ============================================================================

function ToolCallStatusBadge({ status }: { status: ToolCallStatus }) {
  const { icon, color, bgColor, animate } = getToolCallStatusIndicator(status);

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center w-5 h-5 rounded text-xs font-mono',
        color,
        bgColor,
        animate && 'animate-pulse'
      )}
    >
      {icon}
    </span>
  );
}

// ============================================================================
// Collapsible Section Component
// ============================================================================

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
  badge,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-theme-border/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 flex items-center justify-between text-left bg-theme-bg-tertiary/30 hover:bg-theme-bg-tertiary/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-theme-text-dim" />
          ) : (
            <ChevronRight className="w-4 h-4 text-theme-text-dim" />
          )}
          <span className="text-xs text-theme-text-muted font-medium">{title}</span>
        </div>
        {badge}
      </button>
      {isOpen && (
        <div className="p-3 border-t border-theme-border/50 bg-theme-bg-secondary/50">{children}</div>
      )}
    </div>
  );
}

// ============================================================================
// User Input Renderer
// ============================================================================

function UserInputRenderer({ data }: { data: UserInput }) {
  return (
    <div className="space-y-2">
      <div className="text-sm text-theme-text-secondary whitespace-pre-wrap leading-relaxed">{data.text}</div>
      {data.files && data.files.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {data.files.map((file, idx) => (
            <span
              key={idx}
              className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded font-mono"
            >
              {file}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Assistant Turn Renderer (v2 - with nested tool calls)
// ============================================================================

function AssistantTurnRenderer({ data }: { data: AssistantTurn }) {
  return (
    <div className="space-y-3">
      {/* Agent badge */}
      {data.agent && (
        <div className="flex items-center gap-2">
          <span className="text-xs bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded">
            {data.agent}
          </span>
          {data.turn_number !== undefined && data.max_turns !== undefined && data.max_turns > 0 && (
            <span className="text-xs text-theme-text-dim">
              Turn {data.turn_number + 1}/{data.max_turns}
            </span>
          )}
        </div>
      )}

      {/* Reasoning (collapsible if present) */}
      {data.reasoning && (
        <CollapsibleSection title="Reasoning" defaultOpen={false}>
          <div className="text-xs text-purple-300/80 whitespace-pre-wrap font-mono leading-relaxed max-h-[200px] overflow-y-auto">
            {data.reasoning}
          </div>
        </CollapsibleSection>
      )}

      {/* Main text (before tool calls) */}
      {data.text && (
        <div className="text-sm text-theme-text-secondary whitespace-pre-wrap leading-relaxed">
          {data.text}
        </div>
      )}

      {/* Tool calls (inline) */}
      {data.tool_calls && data.tool_calls.length > 0 && (
        <div className="space-y-2">
          {data.tool_calls.map((tc, idx) => (
            <ToolCallItemRenderer key={tc.id || idx} data={tc} />
          ))}
        </div>
      )}

      {/* Metrics bar */}
      {data.metrics && (
        <div className="flex items-center gap-3 text-xs text-theme-text-dim pt-2 border-t border-theme-border/30">
          {data.metrics.model && <span className="text-theme-text-muted">{data.metrics.model}</span>}
          {data.metrics.input_tokens !== undefined && <span>{data.metrics.input_tokens} in</span>}
          {data.metrics.output_tokens !== undefined && <span>{data.metrics.output_tokens} out</span>}
          {data.metrics.duration_ms !== undefined && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {data.metrics.duration_ms}ms
            </span>
          )}
          {data.finish_reason && <span className="text-theme-text-faint">• {data.finish_reason}</span>}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Tool Call Item Renderer (for nested tool calls in AssistantTurn)
// ============================================================================

function ToolCallItemRenderer({ data }: { data: ToolCallItem }) {
  const [showArgs, setShowArgs] = useState(false);
  const [showOutput, setShowOutput] = useState(true);
  const formattedArgs = formatToolArgs(data.args);
  const toolStyle = getToolStyle(data.name);

  const hasOutput = data.streaming_output || data.result?.content;
  const isError = data.status === 'error' || data.error;

  return (
    <div className={cn('border rounded-lg overflow-hidden', toolStyle.border)}>
      {/* Header */}
      <div className={cn('px-3 py-2 flex items-center justify-between', toolStyle.headerBg)}>
        <div className="flex items-center gap-2">
          <span className={cn('text-lg', toolStyle.text)}>{toolStyle.emoji}</span>
          <span className={cn('text-sm font-medium', toolStyle.text)}>{data.name}</span>
          <ToolCallStatusBadge status={data.status} />
        </div>
        <div className="flex items-center gap-2 text-xs text-theme-text-dim">
          {data.duration_ms !== undefined && data.duration_ms > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {data.duration_ms}ms
            </span>
          )}
          {data.result?.exit_code !== undefined && (
            <span className={cn('font-mono', data.result.exit_code !== 0 && 'text-red-400')}>
              exit {data.result.exit_code}
            </span>
          )}
          {data.error?.exit_code !== undefined && (
            <span className="font-mono text-red-400">exit {data.error.exit_code}</span>
          )}
        </div>
      </div>

      {/* Description */}
      {data.description && (
        <div className="px-3 py-2 text-sm text-theme-text-secondary bg-theme-bg-secondary/30 border-b border-theme-border/30">
          {data.description}
        </div>
      )}

      {/* Arguments (collapsible) */}
      <div className="border-t border-theme-border/30">
        <button
          onClick={() => setShowArgs(!showArgs)}
          className="w-full px-3 py-1.5 flex items-center gap-2 text-left bg-theme-bg-tertiary/20 hover:bg-theme-bg-tertiary/40 transition-colors"
        >
          {showArgs ? (
            <ChevronDown className="w-3 h-3 text-theme-text-dim" />
          ) : (
            <ChevronRight className="w-3 h-3 text-theme-text-dim" />
          )}
          <span className="text-xs text-theme-text-dim">Arguments</span>
        </button>
        {showArgs && (
          <div className="p-3 bg-theme-bg-secondary/50">
            <pre className="text-xs text-theme-text-secondary whitespace-pre-wrap break-words font-mono">
              {formattedArgs}
            </pre>
          </div>
        )}
      </div>

      {/* Output (collapsible) */}
      {hasOutput && (
        <div className="border-t border-theme-border/30">
          <button
            onClick={() => setShowOutput(!showOutput)}
            className={cn(
              'w-full px-3 py-1.5 flex items-center justify-between text-left transition-colors',
              isError ? 'bg-red-500/10 hover:bg-red-500/20' : 'bg-theme-bg-tertiary/20 hover:bg-theme-bg-tertiary/40'
            )}
          >
            <div className="flex items-center gap-2">
              {showOutput ? (
                <ChevronDown className="w-3 h-3 text-theme-text-dim" />
              ) : (
                <ChevronRight className="w-3 h-3 text-theme-text-dim" />
              )}
              <span className={cn('text-xs', isError ? 'text-red-400' : 'text-theme-text-dim')}>
                {isError ? 'Error' : 'Output'}
              </span>
            </div>
            {(data.streaming_output_truncated || data.result?.content_truncated) && (
              <span className="text-xs text-yellow-400">truncated</span>
            )}
          </button>
          {showOutput && (
            <div className="relative">
              <pre
                className={cn(
                  'p-3 text-xs whitespace-pre-wrap break-words font-mono max-h-[300px] overflow-y-auto',
                  isError ? 'text-red-200 bg-red-950/30' : 'text-theme-text-secondary bg-theme-bg-secondary/50'
                )}
              >
                {data.error?.message || data.streaming_output || data.result?.content}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Handoff Renderer
// ============================================================================

function HandoffRenderer({ data }: { data: HandoffInfo }) {
  return (
    <div className="border border-violet-500/30 rounded-lg overflow-hidden bg-violet-950/20">
      {/* Header */}
      <div className="px-4 py-3 bg-violet-500/10 border-b border-violet-500/30">
        <div className="flex items-center justify-center gap-4">
          <span className="text-sm font-medium text-violet-300">{data.from_agent}</span>
          <div className="flex items-center gap-2 text-violet-400">
            <div className="w-8 h-px bg-violet-500/50" />
            <ArrowRight className="w-4 h-4" />
            <div className="w-8 h-px bg-violet-500/50" />
          </div>
          <span className="text-sm font-medium text-violet-300">{data.to_agent}</span>
        </div>
      </div>

      {/* Details */}
      <div className="px-4 py-3 space-y-2">
        {data.tool_name && (
          <div className="text-xs text-theme-text-dim">
            via <span className="text-violet-400 font-mono">{data.tool_name}</span>
          </div>
        )}
        {data.reason && (
          <div className="text-sm text-theme-text-secondary">{data.reason}</div>
        )}
        {data.input && (
          <CollapsibleSection title="Input" defaultOpen={false}>
            <div className="text-xs text-theme-text-secondary whitespace-pre-wrap font-mono">
              {data.input}
            </div>
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Legacy Assistant Renderer (v1)
// ============================================================================

function LegacyAssistantRenderer({ data }: { data: Assistant }) {
  return (
    <div className="space-y-3">
      {/* Reasoning (collapsible if present) */}
      {data.reasoning && (
        <CollapsibleSection title="Reasoning" defaultOpen={false}>
          <div className="text-xs text-purple-300/80 whitespace-pre-wrap font-mono leading-relaxed max-h-[200px] overflow-y-auto">
            {data.reasoning}
          </div>
        </CollapsibleSection>
      )}

      {/* Main text */}
      <div className="text-sm text-theme-text-secondary whitespace-pre-wrap leading-relaxed">{data.text}</div>

      {/* Metrics bar */}
      {(data.input_tokens || data.output_tokens || data.model) && (
        <div className="flex items-center gap-3 text-xs text-theme-text-dim pt-2 border-t border-theme-border/30">
          {data.model && <span className="text-theme-text-muted">{data.model}</span>}
          {data.input_tokens !== undefined && <span>{data.input_tokens} in</span>}
          {data.output_tokens !== undefined && <span>{data.output_tokens} out</span>}
          {data.stop_reason && (
            <span className="text-theme-text-faint">• {data.stop_reason}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Legacy Tool Call Renderer (v1)
// ============================================================================

function LegacyToolCallRenderer({ data }: { data: ToolCallData }) {
  const [showArgs, setShowArgs] = useState(false);
  const formattedArgs = formatToolArgs(data.args);
  const toolStyle = getToolStyle(data.name);

  return (
    <div className={cn('border rounded-lg overflow-hidden', toolStyle.border)}>
      {/* Header */}
      <div className={cn('px-3 py-2 flex items-center gap-2', toolStyle.headerBg)}>
        <span className={cn('text-lg', toolStyle.text)}>{toolStyle.emoji}</span>
        <span className={cn('text-sm font-medium', toolStyle.text)}>{data.name}</span>
        <span className="text-xs text-theme-text-dim font-mono">{data.call_id}</span>
      </div>

      {/* Description */}
      {data.description && (
        <div className="px-3 py-2 text-sm text-theme-text-secondary bg-theme-bg-secondary/30 border-b border-theme-border/30">
          {data.description}
        </div>
      )}

      {/* Arguments (collapsible) */}
      <div className="border-t border-theme-border/30">
        <button
          onClick={() => setShowArgs(!showArgs)}
          className="w-full px-3 py-1.5 flex items-center gap-2 text-left bg-theme-bg-tertiary/20 hover:bg-theme-bg-tertiary/40 transition-colors"
        >
          {showArgs ? (
            <ChevronDown className="w-3 h-3 text-theme-text-dim" />
          ) : (
            <ChevronRight className="w-3 h-3 text-theme-text-dim" />
          )}
          <span className="text-xs text-theme-text-dim">Arguments</span>
        </button>
        {showArgs && (
          <div className="p-3 bg-theme-bg-secondary/50">
            <pre className="text-xs text-theme-text-secondary whitespace-pre-wrap break-words font-mono">
              {formattedArgs}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Legacy Tool Result Renderer (v1)
// ============================================================================

function LegacyToolResultRenderer({ data }: { data: ToolResultData }) {
  const isError = data.is_error;
  const hasOutput = data.content || data.streaming_output;

  return (
    <div
      className={cn(
        'border rounded-lg overflow-hidden',
        isError ? 'border-red-500/30' : 'border-emerald-500/30'
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'px-3 py-2 flex items-center justify-between',
          isError ? 'bg-red-500/10' : 'bg-emerald-500/10'
        )}
      >
        <div className="flex items-center gap-2">
          {isError ? (
            <XCircle className="w-4 h-4 text-red-400" />
          ) : (
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          )}
          <span
            className={cn('text-xs font-medium', isError ? 'text-red-300' : 'text-emerald-300')}
          >
            {isError ? 'Error' : 'Result'}
          </span>
          <span className="text-xs text-theme-text-dim font-mono">{data.call_id}</span>
        </div>

        <div className="flex items-center gap-2 text-xs text-theme-text-dim">
          {data.exit_code !== undefined && (
            <span className={cn('font-mono', data.exit_code !== 0 && 'text-red-400')}>
              exit {data.exit_code}
            </span>
          )}
          {data.duration_ms !== undefined && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {data.duration_ms}ms
            </span>
          )}
        </div>
      </div>

      {/* Output */}
      {hasOutput && (
        <div className="relative">
          <pre
            className={cn(
              'p-3 text-xs whitespace-pre-wrap break-words font-mono max-h-[300px] overflow-y-auto',
              isError ? 'text-red-200 bg-red-950/30' : 'text-theme-text-secondary bg-theme-bg-secondary/50'
            )}
          >
            {data.streaming_output || data.content}
          </pre>
          {data.output_truncated && (
            <div className="px-3 py-1 bg-yellow-500/10 text-yellow-400 text-xs border-t border-yellow-500/20">
              Output truncated
            </div>
          )}
        </div>
      )}

      {/* No output */}
      {!hasOutput && (
        <div className="p-3 text-xs text-theme-text-dim italic">No output</div>
      )}
    </div>
  );
}

// ============================================================================
// System Message Renderer
// ============================================================================

function SystemMessageRenderer({ data }: { data: SystemMessage }) {
  const kindStyles: Record<string, { bg: string; border: string; text: string; icon: React.ReactNode }> = {
    info: {
      bg: 'bg-theme-bg-tertiary/30',
      border: 'border-theme-text-faint/30',
      text: 'text-theme-text-secondary',
      icon: <AlertCircle className="w-4 h-4 text-theme-text-muted" />,
    },
    warning: {
      bg: 'bg-yellow-900/20',
      border: 'border-yellow-500/30',
      text: 'text-yellow-200',
      icon: <AlertCircle className="w-4 h-4 text-yellow-400" />,
    },
    error: {
      bg: 'bg-red-900/20',
      border: 'border-red-500/30',
      text: 'text-red-200',
      icon: <XCircle className="w-4 h-4 text-red-400" />,
    },
    guardrail: {
      bg: 'bg-orange-900/20',
      border: 'border-orange-500/30',
      text: 'text-orange-200',
      icon: <AlertCircle className="w-4 h-4 text-orange-400" />,
    },
    rate_limit: {
      bg: 'bg-yellow-900/20',
      border: 'border-yellow-500/30',
      text: 'text-yellow-200',
      icon: <Clock className="w-4 h-4 text-yellow-400" />,
    },
    rewind: {
      bg: 'bg-purple-900/20',
      border: 'border-purple-500/30',
      text: 'text-purple-200',
      icon: <ArrowRight className="w-4 h-4 text-purple-400 rotate-180" />,
    },
  };

  const style = kindStyles[data.kind] || kindStyles.info;

  return (
    <div className={cn('border rounded-lg p-3', style.bg, style.border)}>
      <div className="flex items-start gap-2">
        {style.icon}
        <div className="flex-1 min-w-0">
          {data.title && (
            <div className={cn('text-sm font-medium mb-1', style.text)}>{data.title}</div>
          )}
          <div className={cn('text-sm whitespace-pre-wrap', style.text)}>{data.content}</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Conversation Item Renderer
// ============================================================================

interface ConversationItemRendererProps {
  item: ConversationItem;
  className?: string;
}

/**
 * Renders a canonical ConversationItem with rich, type-specific visualization.
 */
export function ConversationItemRenderer({ item, className }: ConversationItemRendererProps) {
  const colors = getItemTypeColors(item.item_type);
  const label = getItemTypeLabel(item.item_type);

  return (
    <div className={cn('space-y-2', className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className={cn('px-2 py-0.5 rounded text-xs font-medium', colors.badge)}>
          <ItemTypeIcon itemType={item.item_type} className="w-3 h-3 inline mr-1" />
          {label}
        </span>
        {item.status && <StatusIndicator status={item.status} />}
        {item.timestamp && (
          <span className="text-xs text-theme-text-dim">
            {new Date(typeof item.timestamp === 'string' ? parseInt(item.timestamp, 10) : item.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Content based on type */}
      <div className={cn('border-l-2 pl-3', colors.border)}>
        {/* v2 types */}
        {item.item_type === 'user_input' && item.user_input && (
          <UserInputRenderer data={item.user_input} />
        )}
        {item.item_type === 'assistant_turn' && item.turn && (
          <AssistantTurnRenderer data={item.turn} />
        )}
        {item.item_type === 'system' && item.system && (
          <SystemMessageRenderer data={item.system} />
        )}
        {item.item_type === 'handoff' && item.handoff && (
          <HandoffRenderer data={item.handoff} />
        )}

        {/* Legacy v1 types */}
        {item.item_type === 'assistant' && item.assistant && (
          <LegacyAssistantRenderer data={item.assistant} />
        )}
        {item.item_type === 'tool_call' && item.tool_call && (
          <LegacyToolCallRenderer data={item.tool_call} />
        )}
        {item.item_type === 'tool_result' && item.tool_result && (
          <LegacyToolResultRenderer data={item.tool_result} />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Try-Render Helper
// ============================================================================

interface TryRenderCanonicalProps {
  data: unknown;
  fallback: React.ReactNode;
  className?: string;
}

/**
 * Attempts to render data as a canonical ConversationItem.
 * Falls back to the provided fallback component if the data is not canonical.
 */
export function TryRenderCanonical({ data, fallback, className }: TryRenderCanonicalProps) {
  const isCanonical = isConversationItem(data);

  if (isCanonical) {
    return <ConversationItemRenderer item={data} className={className} />;
  }
  return <>{fallback}</>;
}

// ============================================================================
// TurnRendererProps Wrapper
// ============================================================================

import type { TurnRendererProps } from '@/lib/renderer-registry';

/**
 * Wrapper that accepts standard TurnRendererProps interface.
 * Used by the dynamic renderer registry.
 */
export function ConversationRendererWrapper({ data, className }: TurnRendererProps) {
  if (isConversationItem(data)) {
    return <ConversationItemRenderer item={data} className={className} />;
  }
  // If data doesn't match, return null - DynamicRenderer will use fallback
  return null;
}

// ============================================================================
// Export type guard for use in other components
// ============================================================================

export { isConversationItem };
