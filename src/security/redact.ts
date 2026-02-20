const patterns = [
  /sk-[a-zA-Z0-9]{20,}/g,
  /xox[baprs]-[a-zA-Z0-9-]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g,
  /password\s*[:=]\s*[^\s,;]+/gi,
  /token\s*[:=]\s*[^\s,;]+/gi,
];

export function redact(value: string) {
  return patterns.reduce(
    (text, pattern) => text.replace(pattern, "[REDACTED]"),
    value,
  );
}

const hostile = [
  /ignore\s+(all\s+)?(previous|prior)\s+instructions?/gi,
  /system\s+prompt/gi,
  /reveal\s+(secrets?|tokens?|passwords?)/gi,
  /exfiltrat(e|ion)/gi,
  /run\s+tool/gi,
];

export function neutralize(value: string) {
  return hostile.reduce(
    (text, pattern) => text.replace(pattern, "[UNTRUSTED_TEXT]"),
    redact(value),
  );
}

export function sanitize(value: unknown): unknown {
  if (typeof value === "string") return neutralize(value);
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, sanitize(v)]),
    );
  }
  return value;
}
