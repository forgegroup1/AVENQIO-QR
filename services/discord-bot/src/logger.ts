type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let threshold: Level = 'info';

export function setLogLevel(level: Level): void {
  threshold = level;
}

/** Never log a token, a session cookie or an authorization header. */
export function redact(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(/[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}/g, '[redacted-token]')
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]');
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = /token|secret|authorization|password|cookie/i.test(key) ? '[redacted]' : redact(entry);
    }
    return output;
  }
  return value;
}

function write(level: Level, message: string, meta?: unknown): void {
  if (ORDER[level] < ORDER[threshold]) return;
  const stamp = new Date().toISOString();
  const line = `[${stamp}] ${level.toUpperCase().padEnd(5)} ${message}`;
  if (meta === undefined) {
    console[level === 'error' ? 'error' : 'log'](line);
  } else {
    console[level === 'error' ? 'error' : 'log'](line, redact(meta));
  }
}

export const logger = {
  debug: (message: string, meta?: unknown) => write('debug', message, meta),
  info: (message: string, meta?: unknown) => write('info', message, meta),
  warn: (message: string, meta?: unknown) => write('warn', message, meta),
  error: (message: string, meta?: unknown) => write('error', message, meta),
};
