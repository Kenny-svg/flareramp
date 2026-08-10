const SENSITIVE_KEY = /key|secret|token|authorization|credential|password/i;

function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }
  if (Array.isArray(value)) return value.map((entry) => redact(entry, seen));
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[REDACTED]" : redact(entry, seen),
    ]),
  );
}

export interface StructuredLogger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

export function createLogger(
  write: (line: string) => void = (line) => console.log(line),
): StructuredLogger {
  const log = (
    level: "info" | "warn" | "error",
    event: string,
    fields: Record<string, unknown> = {},
  ) => {
    const safeFields = redact(fields) as Record<string, unknown>;
    write(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        event,
        ...safeFields,
      }),
    );
  };
  return {
    info: (event, fields) => log("info", event, fields),
    warn: (event, fields) => log("warn", event, fields),
    error: (event, fields) => log("error", event, fields),
  };
}
