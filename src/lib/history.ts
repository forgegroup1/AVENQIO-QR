import type { ContentKind, ContentState } from "./payload";

export interface HistoryEntry {
  id: string;
  createdAt: number;
  kind: ContentKind;
  label: string;
  content: ContentState;
  foreground: string;
  background: string;
  transparent: boolean;
  style: string;
  frame: boolean;
  caption: string;
  exportSize: number;
}

const KEY = "avenqio-qr-history";
const LIMIT = 12;

export function readHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed.slice(0, LIMIT) : [];
  } catch {
    return [];
  }
}

export function writeHistory(entries: HistoryEntry[]): void {
  localStorage.setItem(KEY, JSON.stringify(entries.slice(0, LIMIT)));
}

export function remember(entry: Omit<HistoryEntry, "id" | "createdAt">): HistoryEntry[] {
  const next: HistoryEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  const existing = readHistory().filter(
    (item) => !(item.kind === next.kind && item.label === next.label && item.content),
  );
  const saved = [next, ...existing].slice(0, LIMIT);
  writeHistory(saved);
  return saved;
}

export function forget(id: string): HistoryEntry[] {
  const saved = readHistory().filter((item) => item.id !== id);
  writeHistory(saved);
  return saved;
}
