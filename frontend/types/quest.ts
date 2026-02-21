/**
 * Quest Types for ai-cxdb Visualization
 *
 * These types mirror the Go types in ai-assistant-core/pkg/quests/
 * and provide typed rendering for quest orchestration events.
 */

// =============================================================================
// Quest Event Types (from events.go)
// =============================================================================

/**
 * All possible quest event types.
 */
export type QuestEventType =
  | 'quest_started'
  | 'stage_changed'
  | 'tool_invoked'
  | 'output_generated'
  | 'pending_review'
  | 'review_approved'
  | 'review_rejected'
  | 'review_escalated'
  | 'quest_completed'
  | 'quest_failed'
  | 'quest_cancelled'
  | 'steering_received'
  | 'judge_intervention';

// =============================================================================
// Event-Specific Data Structures
// =============================================================================

/**
 * Action summary statistics.
 */
export interface ActionSummary {
  total: string | number;
  completed: string | number;
  failed: string | number;
  skipped: string | number;
}

/**
 * Recent action record (non-idempotent actions only).
 */
export interface RecentAction {
  tool: string;
  status: string;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  error?: string;
}

/**
 * Snapshot record from filesystem capture.
 */
export interface SnapshotRecord {
  trigger: string; // 'tool_complete' | 'quest_complete' | 'manual'
  file_count: string | number;
  total_bytes: string | number;
  captured_at: string;
}

/**
 * Evidence gathered for review.
 */
export interface ReviewEvidence {
  summary_content?: string;
  action_summary?: ActionSummary;
  recent_actions?: RecentAction[] | null;
  snapshots?: SnapshotRecord[] | null;
}

/**
 * Data for quest_started event.
 */
export interface QuestStartedData {
  description?: string;
  worker_id?: string;
  reply_platform?: string;
  reply_channel_id?: string;
  reply_thread_ts?: string;
  resumed_from_frozen?: boolean;
  parent_context_id?: string | number;
  root_context_id?: string | number;
}

/**
 * Data for pending_review event.
 */
export interface PendingReviewData {
  result?: string;
  result_length?: string | number;
  evidence?: ReviewEvidence;
}

/**
 * Data for review_approved event.
 */
export interface ReviewApprovedData {
  quality_score?: number;
  auto_approved?: boolean;
  reason?: string;
}

/**
 * Data for review_rejected event.
 */
export interface ReviewRejectedData {
  feedback?: string;
  issues?: string[];
}

/**
 * Data for review_escalated event.
 */
export interface ReviewEscalatedData {
  attempts?: number;
  feedback?: string;
  issues?: string[];
}

/**
 * Data for quest_completed event.
 */
export interface QuestCompletedData {
  result_length?: string | number;
  reply_platform?: string;
  reply_channel_id?: string;
  reply_thread_ts?: string;
}

/**
 * Data for quest_failed event.
 */
export interface QuestFailedData {
  error?: string;
  reply_platform?: string;
  reply_channel_id?: string;
  reply_thread_ts?: string;
}

/**
 * Data for quest_cancelled event.
 */
export interface QuestCancelledData {
  reason?: string;
  reply_platform?: string;
  reply_channel_id?: string;
  reply_thread_ts?: string;
}

/**
 * Data for steering_received event.
 */
export interface SteeringReceivedData {
  steering_type?: string; // 'guidance' | 'change_requirements' | 'pause' | 'resume' | 'cancel'
  message?: string;
  source?: string; // 'user' | 'quest_agent' | 'sheet'
}

/**
 * Data for judge_intervention event.
 */
export interface JudgeInterventionData {
  intervention?: string;
  confidence?: number;
  observations?: string[];
  tool_call_count?: number;
}

/**
 * Data for stage_changed event.
 */
export interface StageChangedData {
  stage?: string;
  previous_stage?: string;
}

/**
 * Data for tool_invoked event.
 */
export interface ToolInvokedData {
  tool?: string;
  action_id?: string;
}

/**
 * Data for output_generated event.
 */
export interface OutputGeneratedData {
  length?: number;
  truncated?: boolean;
}

/**
 * Union type for all event data types.
 */
export type QuestEventData =
  | QuestStartedData
  | PendingReviewData
  | ReviewApprovedData
  | ReviewRejectedData
  | ReviewEscalatedData
  | QuestCompletedData
  | QuestFailedData
  | QuestCancelledData
  | SteeringReceivedData
  | JudgeInterventionData
  | StageChangedData
  | ToolInvokedData
  | OutputGeneratedData
  | Record<string, unknown>;

// =============================================================================
// Main Quest Event Type
// =============================================================================

/**
 * QuestEvent represents a lifecycle event from the quest orchestration system.
 */
export interface QuestEvent {
  /** The type of quest event. */
  event_type: string;
  /** Unix timestamp in milliseconds. */
  timestamp: string | number;
  /** Unique identifier for the quest. */
  quest_id: string;
  /** User who initiated the quest. */
  user_id: string;
  /** Event-specific data payload. */
  data?: QuestEventData;
}

// =============================================================================
// Quest Snapshot Type (separate from event snapshots)
// =============================================================================

/**
 * QuestSnapshot represents a filesystem snapshot turn payload.
 */
export interface QuestSnapshot {
  quest_id: string;
  trigger: string;
  file_count: number;
  total_bytes: number;
  captured_at: number | string;
}

// =============================================================================
// Type Guards
// =============================================================================

export function isQuestEvent(data: unknown): data is QuestEvent {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.event_type === 'string' &&
    typeof d.quest_id === 'string' &&
    !('item_type' in d)
  );
}

export function isQuestSnapshot(data: unknown): data is QuestSnapshot {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.quest_id === 'string' &&
    typeof d.trigger === 'string' &&
    typeof d.file_count === 'number'
  );
}

// Type guards for specific event data
export function isPendingReviewData(data: unknown): data is PendingReviewData {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return 'result' in d || 'evidence' in d;
}

export function isQuestStartedData(data: unknown): data is QuestStartedData {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return 'description' in d || 'worker_id' in d;
}

// =============================================================================
// Display Helpers
// =============================================================================

export function getQuestEventLabel(eventType: string): string {
  switch (eventType) {
    case 'quest_started': return 'Quest Started';
    case 'stage_changed': return 'Stage Changed';
    case 'tool_invoked': return 'Tool Invoked';
    case 'output_generated': return 'Output Generated';
    case 'pending_review': return 'Pending Review';
    case 'review_approved': return 'Review Approved';
    case 'review_rejected': return 'Review Rejected';
    case 'review_escalated': return 'Review Escalated';
    case 'quest_completed': return 'Quest Completed';
    case 'quest_failed': return 'Quest Failed';
    case 'quest_cancelled': return 'Quest Cancelled';
    case 'steering_received': return 'Steering Received';
    case 'judge_intervention': return 'Judge Intervention';
    default: return eventType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}

export function getQuestEventColors(eventType: string): {
  badge: string;
  border: string;
  headerBg: string;
  icon: string;
} {
  switch (eventType) {
    case 'quest_started':
      return {
        badge: 'bg-emerald-500/20 text-emerald-300',
        border: 'border-emerald-500/30',
        headerBg: 'bg-emerald-500/10',
        icon: 'text-emerald-400',
      };
    case 'quest_completed':
    case 'review_approved':
      return {
        badge: 'bg-green-500/20 text-green-300',
        border: 'border-green-500/30',
        headerBg: 'bg-green-500/10',
        icon: 'text-green-400',
      };
    case 'quest_failed':
    case 'review_rejected':
      return {
        badge: 'bg-red-500/20 text-red-300',
        border: 'border-red-500/30',
        headerBg: 'bg-red-500/10',
        icon: 'text-red-400',
      };
    case 'quest_cancelled':
      return {
        badge: 'bg-slate-500/20 text-slate-300',
        border: 'border-slate-500/30',
        headerBg: 'bg-slate-500/10',
        icon: 'text-slate-400',
      };
    case 'pending_review':
      return {
        badge: 'bg-amber-500/20 text-amber-300',
        border: 'border-amber-500/30',
        headerBg: 'bg-amber-500/10',
        icon: 'text-amber-400',
      };
    case 'review_escalated':
      return {
        badge: 'bg-orange-500/20 text-orange-300',
        border: 'border-orange-500/30',
        headerBg: 'bg-orange-500/10',
        icon: 'text-orange-400',
      };
    case 'steering_received':
      return {
        badge: 'bg-blue-500/20 text-blue-300',
        border: 'border-blue-500/30',
        headerBg: 'bg-blue-500/10',
        icon: 'text-blue-400',
      };
    case 'judge_intervention':
      return {
        badge: 'bg-purple-500/20 text-purple-300',
        border: 'border-purple-500/30',
        headerBg: 'bg-purple-500/10',
        icon: 'text-purple-400',
      };
    case 'tool_invoked':
    case 'stage_changed':
      return {
        badge: 'bg-violet-500/20 text-violet-300',
        border: 'border-violet-500/30',
        headerBg: 'bg-violet-500/10',
        icon: 'text-violet-400',
      };
    default:
      return {
        badge: 'bg-indigo-500/20 text-indigo-300',
        border: 'border-indigo-500/30',
        headerBg: 'bg-indigo-500/10',
        icon: 'text-indigo-400',
      };
  }
}

export function getQuestEventEmoji(eventType: string): string {
  switch (eventType) {
    case 'quest_started': return '\u{1F680}'; // rocket
    case 'quest_completed': return '\u{2705}'; // check mark
    case 'quest_failed': return '\u{274C}'; // cross
    case 'quest_cancelled': return '\u{1F6D1}'; // stop
    case 'pending_review': return '\u{1F440}'; // eyes
    case 'review_approved': return '\u{1F44D}'; // thumbs up
    case 'review_rejected': return '\u{1F44E}'; // thumbs down
    case 'review_escalated': return '\u{26A0}'; // warning
    case 'steering_received': return '\u{1F3AF}'; // target
    case 'judge_intervention': return '\u{2696}'; // scales
    case 'stage_changed': return '\u{27A1}'; // arrow
    case 'tool_invoked': return '\u{1F527}'; // wrench
    case 'output_generated': return '\u{1F4DD}'; // memo
    default: return '\u{1F4CB}'; // clipboard
  }
}

export function formatBytes(bytes: number | string): string {
  const b = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (b === 0 || isNaN(b)) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${parseFloat((b / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function getShortQuestName(questId: string): string {
  const parts = questId.split('/');
  const slug = parts[parts.length - 1];
  const withoutTimestamp = slug.replace(/-\d{8}-\d{6}$/, '');
  if (withoutTimestamp.length > 60) {
    return withoutTimestamp.slice(0, 57) + '...';
  }
  return withoutTimestamp;
}

export function formatTimestamp(ts: string | number): string {
  const num = typeof ts === 'string' ? parseInt(ts, 10) : ts;
  if (isNaN(num)) return '';
  return new Date(num).toLocaleString();
}

export function formatTimeOnly(ts: string | number): string {
  const num = typeof ts === 'string' ? parseInt(ts, 10) : ts;
  if (isNaN(num)) return '';
  return new Date(num).toLocaleTimeString();
}
