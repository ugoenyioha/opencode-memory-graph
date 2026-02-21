/**
 * Provenance Types for ai-cxdb
 *
 * These types mirror the Go types in clients/go/types/provenance.go
 * and capture the complete origin story of a context.
 */

/**
 * Provenance captures the origin story of a context.
 * Immutable once captured - tells you "where did this context come from?"
 */
export interface Provenance {
  // === Context Lineage ===
  // How this context relates to others

  /** The context that spawned this one (if any). */
  parent_context_id?: number;

  /** Why this context was created: "fork", "quest", "delegation", "sub_agent" */
  spawn_reason?: string;

  /** The ultimate ancestor context (may equal parent_context_id). */
  root_context_id?: number;

  // === Request Identity (per-interaction) ===

  /** W3C trace-id (32 hex chars) for distributed tracing. */
  trace_id?: string;

  /** W3C parent-id (16 hex chars) for distributed tracing. */
  span_id?: string;

  /** Custom correlation identifier for request tracking. */
  correlation_id?: string;

  // === User Identity (on whose behalf) ===

  /** User ID this context is serving. */
  on_behalf_of?: string;

  /** Where the user request originated: "slack", "web", "api", "cli", etc. */
  on_behalf_of_source?: string;

  /** User's email address (if known). */
  on_behalf_of_email?: string;

  // === Writer Identity (authenticated caller) ===

  /** Authentication method: "k8s_oidc", "aws_sts", "api_key", "none" */
  writer_method?: string;

  /** Authenticated principal identifier (e.g., K8s service account or ARN). */
  writer_subject?: string;

  /** Token issuer URL. */
  writer_issuer?: string;

  // === Process Identity (compute instance) ===

  /** Logical service name (e.g., "ai-assistant"). */
  service_name?: string;

  /** Service version string. */
  service_version?: string;

  /** UUID identifying this specific instance. */
  service_instance_id?: string;

  /** OS process ID. */
  process_pid?: number;

  /** OS user running the process. */
  process_owner?: string;

  /** Machine hostname. */
  host_name?: string;

  /** CPU architecture (e.g., "amd64", "arm64"). */
  host_arch?: string;

  // === Network Identity (server-observed) ===

  /** Apparent client IP address (set by server). */
  client_address?: string;

  /** Client's source port (set by server). */
  client_port?: number;

  // === Environment Context ===

  /** Selected environment variables (from allowlist). */
  env?: Record<string, string>;

  // === SDK Identity ===

  /** Client SDK identifier (e.g., "ai-agents-sdk", "cxdb-go"). */
  sdk_name?: string;

  /** SDK version string. */
  sdk_version?: string;

  // === Timestamps ===

  /** When this provenance was captured (Unix milliseconds). */
  captured_at?: number;
}

/**
 * ContextMetadata contains context-level metadata from the first turn.
 */
export interface ContextMetadata {
  /** Client tag (e.g., "claude-code", "dotrunner"). */
  client_tag?: string;

  /** Human-readable context title. */
  title?: string;

  /** Arbitrary tags for organization/filtering. */
  labels?: string[];

  /** Arbitrary key-value metadata. */
  custom?: Record<string, string>;

  /** Complete origin story. */
  provenance?: Provenance;
}

// =============================================================================
// Display Helpers
// =============================================================================

/** Source icons and colors for on_behalf_of_source */
export const SOURCE_STYLES: Record<string, { icon: string; color: string; label: string }> = {
  slack: { icon: '#', color: 'text-pink-400', label: 'Slack' },
  web: { icon: '🌐', color: 'text-blue-400', label: 'Web' },
  api: { icon: '⚡', color: 'text-amber-400', label: 'API' },
  cli: { icon: '⌘', color: 'text-slate-400', label: 'CLI' },
  telegram: { icon: '✈', color: 'text-cyan-400', label: 'Telegram' },
  sms: { icon: '💬', color: 'text-green-400', label: 'SMS' },
  email: { icon: '✉', color: 'text-indigo-400', label: 'Email' },
  quest: { icon: '🔮', color: 'text-purple-400', label: 'Quest' },
};

export const DEFAULT_SOURCE_STYLE = { icon: '?', color: 'text-slate-500', label: 'Unknown' };

/** Spawn reason styles */
export const SPAWN_REASON_STYLES: Record<string, { icon: string; color: string; label: string }> = {
  fork: { icon: '⑂', color: 'text-emerald-400', label: 'Fork' },
  quest: { icon: '🔮', color: 'text-purple-400', label: 'Quest' },
  delegation: { icon: '→', color: 'text-blue-400', label: 'Delegation' },
  sub_agent: { icon: '🤖', color: 'text-amber-400', label: 'Sub-agent' },
};

export const DEFAULT_SPAWN_REASON_STYLE = { icon: '•', color: 'text-slate-500', label: 'Created' };

/** Writer method styles */
export const WRITER_METHOD_STYLES: Record<string, { icon: string; color: string; label: string }> = {
  k8s_oidc: { icon: '☸', color: 'text-blue-400', label: 'K8s OIDC' },
  aws_sts: { icon: '☁', color: 'text-amber-400', label: 'AWS STS' },
  api_key: { icon: '🔑', color: 'text-emerald-400', label: 'API Key' },
  none: { icon: '○', color: 'text-slate-500', label: 'None' },
};

export const DEFAULT_WRITER_METHOD_STYLE = { icon: '?', color: 'text-slate-500', label: 'Unknown' };

export function getSourceStyle(source?: string) {
  return source ? SOURCE_STYLES[source.toLowerCase()] || DEFAULT_SOURCE_STYLE : DEFAULT_SOURCE_STYLE;
}

export function getSpawnReasonStyle(reason?: string) {
  return reason ? SPAWN_REASON_STYLES[reason.toLowerCase()] || DEFAULT_SPAWN_REASON_STYLE : DEFAULT_SPAWN_REASON_STYLE;
}

export function getWriterMethodStyle(method?: string) {
  return method ? WRITER_METHOD_STYLES[method.toLowerCase()] || DEFAULT_WRITER_METHOD_STYLE : DEFAULT_WRITER_METHOD_STYLE;
}

/**
 * Check if provenance has any lineage information.
 */
export function hasLineage(prov?: Provenance): boolean {
  return !!(prov?.parent_context_id || prov?.root_context_id || prov?.spawn_reason);
}

/**
 * Check if provenance has user identity.
 */
export function hasUserIdentity(prov?: Provenance): boolean {
  return !!(prov?.on_behalf_of || prov?.on_behalf_of_email);
}

/**
 * Check if provenance has writer identity.
 */
export function hasWriterIdentity(prov?: Provenance): boolean {
  return !!(prov?.writer_method || prov?.writer_subject);
}

/**
 * Check if provenance has process identity.
 */
export function hasProcessIdentity(prov?: Provenance): boolean {
  return !!(prov?.service_name || prov?.host_name || prov?.process_pid);
}

/**
 * Check if provenance has any trace context.
 */
export function hasTraceContext(prov?: Provenance): boolean {
  return !!(prov?.trace_id || prov?.span_id || prov?.correlation_id);
}

/**
 * Format a truncated trace ID for display.
 */
export function formatTraceId(traceId?: string): string {
  if (!traceId) return '';
  if (traceId.length <= 12) return traceId;
  return `${traceId.slice(0, 8)}...${traceId.slice(-4)}`;
}

/**
 * Format service identity for display.
 */
export function formatServiceIdentity(prov?: Provenance): string {
  if (!prov) return '';
  const parts: string[] = [];
  if (prov.service_name) {
    parts.push(prov.service_name);
  }
  if (prov.service_version) {
    parts.push(`v${prov.service_version}`);
  }
  return parts.join(' ');
}

/**
 * Format host identity for display.
 */
export function formatHostIdentity(prov?: Provenance): string {
  if (!prov) return '';
  const parts: string[] = [];
  if (prov.host_name) {
    parts.push(prov.host_name);
  }
  if (prov.host_arch) {
    parts.push(`(${prov.host_arch})`);
  }
  return parts.join(' ');
}
