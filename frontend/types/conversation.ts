/**
 * Canonical Conversation Types for ai-cxdb Visualization
 *
 * These types mirror the Go types in clients/go/types/ and provide
 * a well-defined schema that the frontend can render with certainty.
 *
 * Schema version 2 introduces:
 * - assistant_turn: Nested tool calls within assistant responses
 * - handoff: Agent-to-agent transitions
 *
 * Legacy types (assistant, tool_call, tool_result) are kept for backward compatibility.
 */

// Type ID constants matching the registry bundle
export const TYPE_ID_CONVERSATION_ITEM = 'cxdb.ConversationItem';
export const TYPE_VERSION_CONVERSATION_ITEM = 3;

// =============================================================================
// Enums
// =============================================================================

/**
 * ItemType discriminates which variant of ConversationItem is populated.
 */
export type ItemType =
  | 'user_input'
  | 'assistant_turn'
  | 'system'
  | 'handoff'
  // Legacy types (v1)
  | 'assistant'
  | 'tool_call'
  | 'tool_result';

/**
 * ItemStatus represents the lifecycle state of an item.
 */
export type ItemStatus = 'pending' | 'streaming' | 'complete' | 'error' | 'cancelled';

/**
 * ToolCallStatus provides finer-grained tool execution state.
 */
export type ToolCallStatus = 'pending' | 'executing' | 'complete' | 'error' | 'skipped';

/**
 * SystemKind categorizes system messages.
 */
export type SystemKind = 'info' | 'warning' | 'error' | 'guardrail' | 'rate_limit' | 'rewind';

// =============================================================================
// Core Types
// =============================================================================

/**
 * ConversationItem is the canonical turn type for conversation visualization.
 *
 * Exactly one of the variant fields will be populated based on the item_type discriminator.
 */
export interface ConversationItem {
  /** Discriminates which variant is populated. REQUIRED. */
  item_type: ItemType;
  /** The item's lifecycle state. */
  status?: ItemStatus;
  /** When this item was created (Unix milliseconds). Can be string or number. */
  timestamp?: number | string;
  /** Optional unique identifier for this item. */
  id?: string;

  // Primary variants (v2 schema)
  user_input?: UserInput;
  turn?: AssistantTurn;
  system?: SystemMessage;
  handoff?: HandoffInfo;

  // Legacy variants (v1 schema)
  assistant?: Assistant;
  tool_call?: ToolCallData;
  tool_result?: ToolResultData;
}

// =============================================================================
// User Input
// =============================================================================

/**
 * UserInput represents user-provided input to the conversation.
 */
export interface UserInput {
  /** The primary text content from the user. */
  text: string;
  /** File paths included with the input. */
  files?: string[];
}

// =============================================================================
// Assistant Turn (v2 - nested tool calls)
// =============================================================================

/**
 * AssistantTurn represents one complete assistant response.
 * A turn may include text, tool calls, reasoning, and metrics as a unified cognitive unit.
 */
export interface AssistantTurn {
  /** The assistant's response text. */
  text: string;
  /** All tool invocations made during this turn. */
  tool_calls?: ToolCallItem[];
  /** Extended thinking/reasoning output (if enabled). */
  reasoning?: string;
  /** Token usage for this turn. */
  metrics?: TurnMetrics;
  /** Name of the agent that produced this turn (for multi-agent). */
  agent?: string;
  /** Sequential turn number within the run (0-indexed). */
  turn_number?: number;
  /** Maximum allowed turns (for progress indication). */
  max_turns?: number;
  /** Why generation stopped. */
  finish_reason?: string;
}

/**
 * ToolCallItem represents a single tool invocation with full lifecycle.
 */
export interface ToolCallItem {
  /** Unique identifier for this tool call. */
  id: string;
  /** The tool/function name. */
  name: string;
  /** JSON-encoded tool arguments. */
  args: string;
  /** Tool execution state. */
  status: ToolCallStatus;
  /** Human-readable description of what the tool is doing. */
  description?: string;
  /** Real-time output from the tool (e.g., shell output). */
  streaming_output?: string;
  /** Whether streaming output was truncated. */
  streaming_output_truncated?: boolean;
  /** Final tool result (on success). */
  result?: ToolCallResult;
  /** Error details (on failure). */
  error?: ToolCallError;
  /** Execution duration in milliseconds. */
  duration_ms?: number;
}

/**
 * ToolCallResult captures successful tool execution.
 */
export interface ToolCallResult {
  /** The tool output (may be truncated). */
  content: string;
  /** Whether content was truncated. */
  content_truncated?: boolean;
  /** Whether the tool completed successfully. */
  success: boolean;
  /** Exit code for shell commands. */
  exit_code?: number;
}

/**
 * ToolCallError captures failed tool execution.
 */
export interface ToolCallError {
  /** Machine-readable error code. */
  code?: string;
  /** Human-readable error description. */
  message: string;
  /** Exit code for shell commands. */
  exit_code?: number;
}

/**
 * TurnMetrics captures token usage and timing for a turn.
 */
export interface TurnMetrics {
  /** Number of input/prompt tokens. */
  input_tokens: number;
  /** Number of output/completion tokens. */
  output_tokens: number;
  /** Total tokens (input + output). */
  total_tokens: number;
  /** Cached input tokens (if applicable). */
  cached_tokens?: number;
  /** Tokens used for extended thinking (if applicable). */
  reasoning_tokens?: number;
  /** Total turn duration in milliseconds. */
  duration_ms?: number;
  /** Model used for this turn. */
  model?: string;
}

// =============================================================================
// System Message
// =============================================================================

/**
 * SystemMessage represents a system-level message or event.
 */
export interface SystemMessage {
  /** Categorizes this system message. */
  kind: SystemKind;
  /** Short summary (optional). */
  title?: string;
  /** The message content. */
  content: string;
}

// =============================================================================
// Handoff
// =============================================================================

/**
 * HandoffInfo captures agent-to-agent handoff details.
 */
export interface HandoffInfo {
  /** Source agent name. */
  from_agent: string;
  /** Destination agent name. */
  to_agent: string;
  /** Handoff tool that was invoked. */
  tool_name?: string;
  /** Input passed to the target agent. */
  input?: string;
  /** Why the handoff occurred. */
  reason?: string;
}

// =============================================================================
// Legacy Types (v1 schema - kept for backward compatibility)
// =============================================================================

/**
 * Assistant represents an assistant response (legacy flat type).
 * @deprecated Use AssistantTurn for new code.
 */
export interface Assistant {
  /** The assistant's response text. */
  text: string;
  /** Extended thinking/reasoning output (if enabled). */
  reasoning?: string;
  /** The model that generated this response. */
  model?: string;
  /** Number of input tokens used. */
  input_tokens?: number;
  /** Number of output tokens generated. */
  output_tokens?: number;
  /** Why generation stopped. */
  stop_reason?: string;
}

/**
 * ToolCallData represents a tool invocation request (legacy flat type).
 * @deprecated Use ToolCallItem in AssistantTurn for new code.
 */
export interface ToolCallData {
  /** Unique identifier for this tool call. */
  call_id: string;
  /** The tool/function name being invoked. */
  name: string;
  /** JSON-encoded tool arguments. */
  args: string;
  /** Human-readable description of what the tool is doing. */
  description?: string;
}

/**
 * ToolResultData represents the outcome of a tool invocation (legacy flat type).
 * @deprecated Use ToolCallItem with result/error in AssistantTurn for new code.
 */
export interface ToolResultData {
  /** Links this result to its corresponding ToolCall. */
  call_id: string;
  /** The tool's output. */
  content: string;
  /** Whether the tool execution failed. */
  is_error: boolean;
  /** Exit code for shell commands. */
  exit_code?: number;
  /** Accumulated real-time output (e.g., shell output). */
  streaming_output?: string;
  /** Whether the output was truncated due to size limits. */
  output_truncated?: boolean;
  /** Execution duration in milliseconds. */
  duration_ms?: number;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard to check if a turn's data is a canonical ConversationItem.
 * Returns true if the data has an item_type field with a valid value.
 */
export function isConversationItem(data: unknown): data is ConversationItem {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const obj = data as Record<string, unknown>;

  const itemType = obj.item_type;
  if (typeof itemType !== 'string') {
    return false;
  }

  const validTypes: ItemType[] = [
    'user_input',
    'assistant_turn',
    'system',
    'handoff',
    // Legacy types
    'assistant',
    'tool_call',
    'tool_result',
  ];
  return validTypes.includes(itemType as ItemType);
}

/**
 * Check if item is using the v2 nested schema.
 */
export function isV2Item(item: ConversationItem): boolean {
  return item.item_type === 'assistant_turn' || item.item_type === 'handoff';
}

/**
 * Check if item is using the legacy v1 flat schema.
 */
export function isLegacyItem(item: ConversationItem): boolean {
  return (
    item.item_type === 'assistant' ||
    item.item_type === 'tool_call' ||
    item.item_type === 'tool_result'
  );
}

// =============================================================================
// Display Helpers
// =============================================================================

/**
 * Extract the display label for an item type.
 */
export function getItemTypeLabel(itemType: ItemType): string {
  switch (itemType) {
    case 'user_input':
      return 'User';
    case 'assistant_turn':
      return 'Assistant';
    case 'system':
      return 'System';
    case 'handoff':
      return 'Handoff';
    // Legacy types
    case 'assistant':
      return 'Assistant';
    case 'tool_call':
      return 'Tool Call';
    case 'tool_result':
      return 'Tool Result';
    default:
      return 'Unknown';
  }
}

/**
 * Get color classes for an item type.
 */
export function getItemTypeColors(itemType: ItemType): {
  badge: string;
  text: string;
  border: string;
  bg: string;
} {
  switch (itemType) {
    case 'user_input':
      return {
        badge: 'bg-theme-role-user-muted text-theme-role-user',
        text: 'text-theme-role-user',
        border: 'border-l-theme-role-user',
        bg: 'bg-theme-role-user-muted',
      };
    case 'assistant_turn':
    case 'assistant':
      return {
        badge: 'bg-theme-role-assistant-muted text-theme-role-assistant',
        text: 'text-theme-role-assistant',
        border: 'border-l-theme-role-assistant',
        bg: 'bg-theme-role-assistant-muted',
      };
    case 'tool_call':
      return {
        badge: 'bg-theme-role-tool-muted text-theme-role-tool',
        text: 'text-theme-role-tool',
        border: 'border-l-theme-role-tool',
        bg: 'bg-theme-role-tool-muted',
      };
    case 'tool_result':
      return {
        badge: 'bg-theme-success-muted text-theme-success',
        text: 'text-theme-success',
        border: 'border-l-theme-success',
        bg: 'bg-theme-success-muted',
      };
    case 'system':
      return {
        badge: 'bg-theme-role-system-muted text-theme-role-system',
        text: 'text-theme-role-system',
        border: 'border-l-theme-role-system',
        bg: 'bg-theme-role-system-muted',
      };
    case 'handoff':
      return {
        badge: 'bg-theme-accent-muted text-theme-accent',
        text: 'text-theme-accent',
        border: 'border-l-theme-accent',
        bg: 'bg-theme-accent-muted',
      };
    default:
      return {
        badge: 'bg-theme-tag-default-bg text-theme-tag-default',
        text: 'text-theme-text-dim',
        border: 'border-l-theme-border',
        bg: 'bg-theme-tag-default-bg',
      };
  }
}

/**
 * Get status indicator properties.
 */
export function getStatusIndicator(status?: ItemStatus): {
  icon: 'pending' | 'streaming' | 'complete' | 'error' | 'cancelled';
  color: string;
  animate: boolean;
} {
  switch (status) {
    case 'pending':
      return { icon: 'pending', color: 'text-slate-400', animate: true };
    case 'streaming':
      return { icon: 'streaming', color: 'text-green-400', animate: true };
    case 'complete':
      return { icon: 'complete', color: 'text-green-500', animate: false };
    case 'error':
      return { icon: 'error', color: 'text-red-500', animate: false };
    case 'cancelled':
      return { icon: 'cancelled', color: 'text-slate-500', animate: false };
    default:
      return { icon: 'complete', color: 'text-slate-500', animate: false };
  }
}

/**
 * Get tool call status indicator properties.
 */
export function getToolCallStatusIndicator(status: ToolCallStatus): {
  icon: string;
  color: string;
  bgColor: string;
  animate: boolean;
} {
  switch (status) {
    case 'pending':
      return { icon: '○', color: 'text-slate-400', bgColor: 'bg-slate-500/20', animate: true };
    case 'executing':
      return { icon: '◐', color: 'text-blue-400', bgColor: 'bg-blue-500/20', animate: true };
    case 'complete':
      return { icon: '✓', color: 'text-green-400', bgColor: 'bg-green-500/20', animate: false };
    case 'error':
      return { icon: '✗', color: 'text-red-400', bgColor: 'bg-red-500/20', animate: false };
    case 'skipped':
      return { icon: '⊘', color: 'text-slate-500', bgColor: 'bg-slate-500/20', animate: false };
    default:
      return { icon: '?', color: 'text-slate-400', bgColor: 'bg-slate-500/20', animate: false };
  }
}

// =============================================================================
// Tool Styling
// =============================================================================

/**
 * Get tool-specific styling based on tool name.
 */
export function getToolStyle(toolName: string): {
  emoji: string;
  border: string;
  headerBg: string;
  text: string;
} {
  const name = toolName.toLowerCase();

  if (name === 'bash' || name === 'shell') {
    return {
      emoji: '⌘',
      border: 'border-slate-600/50',
      headerBg: 'bg-slate-800/50',
      text: 'text-slate-200',
    };
  }

  if (name === 'read') {
    return {
      emoji: '📄',
      border: 'border-cyan-500/30',
      headerBg: 'bg-cyan-500/10',
      text: 'text-cyan-300',
    };
  }

  if (name === 'write') {
    return {
      emoji: '✏️',
      border: 'border-green-500/30',
      headerBg: 'bg-green-500/10',
      text: 'text-green-300',
    };
  }

  if (name === 'edit') {
    return {
      emoji: '±',
      border: 'border-amber-500/30',
      headerBg: 'bg-amber-500/10',
      text: 'text-amber-300',
    };
  }

  if (name === 'glob' || name === 'grep') {
    return {
      emoji: '🔍',
      border: 'border-indigo-500/30',
      headerBg: 'bg-indigo-500/10',
      text: 'text-indigo-300',
    };
  }

  if (name === 'websearch' || name === 'webfetch') {
    return {
      emoji: '🌐',
      border: 'border-sky-500/30',
      headerBg: 'bg-sky-500/10',
      text: 'text-sky-300',
    };
  }

  if (name === 'task') {
    return {
      emoji: '🤖',
      border: 'border-theme-accent/30',
      headerBg: 'bg-theme-accent-muted',
      text: 'text-theme-accent',
    };
  }

  if (name === 'todowrite') {
    return {
      emoji: '☑️',
      border: 'border-emerald-500/30',
      headerBg: 'bg-emerald-500/10',
      text: 'text-emerald-300',
    };
  }

  // Default
  return {
    emoji: '🔧',
    border: 'border-amber-500/30',
    headerBg: 'bg-amber-500/10',
    text: 'text-amber-300',
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Parse JSON args string safely.
 */
export function parseToolArgs(args: string): Record<string, unknown> | null {
  try {
    return JSON.parse(args);
  } catch {
    return null;
  }
}

/**
 * Format tool args for display.
 */
export function formatToolArgs(args: string): string {
  const parsed = parseToolArgs(args);
  if (!parsed) return args;
  try {
    return JSON.stringify(parsed, null, 2);
  } catch {
    return args;
  }
}
