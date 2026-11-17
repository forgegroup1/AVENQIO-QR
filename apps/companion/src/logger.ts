import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MAX_BYTES = 512 * 1024;
const KEEP_LINES = 200;

let logFile: string | null = null;
const memory: string[] = [];

/** File logging starts once Electron tells us where userData lives. */
export function configureLogger(directory: string): void {
  try {
    mkdirSync(directory, { recursive: true });
    logFile = join(directory, 'companion.log');
  } catch {
    logFile = null;
  }
}

function rotateIfNeeded(file: string): void {
  try {
    if (existsSync(file) && statSync(file).size > MAX_BYTES) {
      renameSync(file, `${file}.1`);
    }
  } catch {
    // Rotation must never break logging.
  }
}

export function log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: unknown): void {
  const stamp = new Date().toISOString();
  const detail = meta === undefined ? '' : ` ${safeJson(meta)}`;
  const line = `${stamp} ${level.toUpperCase()} ${message}${detail}`;
  memory.push(line);
  if (memory.length > KEEP_LINES) memory.shift();
  if (level === 'error') console.error(line);
  else if (level === 'debug') console.debug(line);
  else console.log(line);
  if (logFile) {
    try {
      rotateIfNeeded(logFile);
      appendFileSync(logFile, `${line}\n`, 'utf8');
    } catch {
      // ignore disk errors
    }
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '"[unserializable]"';
  }
}

export function recentLogs(): string[] {
  return [...memory];
}
