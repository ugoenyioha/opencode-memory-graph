/**
 * Merge class names, filtering out falsy values.
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Truncate text to a maximum length, adding ellipsis if needed.
 */
export function trunc(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/**
 * Safely stringify a value to JSON, handling circular refs and errors.
 */
export function safeStringify(value: unknown, indent: number = 2): string {
  try {
    return JSON.stringify(value, null, indent);
  } catch {
    return '[unserializable]';
  }
}

/**
 * Format a timestamp for display.
 */
export function formatTimestamp(ts: string | number): string {
  try {
    const date = new Date(ts);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(ts);
  }
}

/**
 * Format a timestamp as just time (HH:MM:SS).
 */
export function formatTime(ts: string | number): string {
  try {
    const date = new Date(ts);
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(ts);
  }
}

/**
 * Parse a string that might be a number to a string context ID.
 */
export function normalizeContextId(input: string): string {
  return input.trim();
}

/**
 * Extract a preview of content for summaries.
 */
export function contentPreview(content: unknown, max: number = 120): string {
  if (typeof content === 'string') {
    return trunc(content.replace(/\s+/g, ' ').trim(), max);
  }
  if (content === null || content === undefined) {
    return '';
  }
  const json = safeStringify(content, 0);
  return trunc(json.replace(/\s+/g, ' '), max);
}
