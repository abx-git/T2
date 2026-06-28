/**
 * Rollierende lokale Board-Sicherung (24 h) im Browser — unabhängig vom Server.
 */

import { boardExportTextsEquivalent, boardImportPayloadFromExportText } from "@/lib/task-tree-json";

const STORAGE_KEY = "t2-board-local-backup-v1";
const RETENTION_MS = 24 * 60 * 60 * 1000;
/** Mindestabstand zwischen zwei Zeitpunkten mit gleichem Inhalt. */
const MIN_INTERVAL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 96;

export interface LocalBoardBackupEntry {
  savedAt: string;
  json: string;
}

export interface LocalBoardBackupStoreV1 {
  version: 1;
  entries: LocalBoardBackupEntry[];
}

export interface LocalBoardBackupListItem {
  savedAt: string;
  rootCount: number;
}

function readStore(): LocalBoardBackupStoreV1 {
  if (typeof window === "undefined") return { version: 1, entries: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, entries: [] };
    const parsed = JSON.parse(raw) as LocalBoardBackupStoreV1;
    if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) {
      return { version: 1, entries: [] };
    }
    const entries = parsed.entries.filter(
      (e): e is LocalBoardBackupEntry =>
        typeof e?.savedAt === "string" && typeof e?.json === "string" && e.json.trim().length > 0,
    );
    return { version: 1, entries };
  } catch {
    return { version: 1, entries: [] };
  }
}

function writeStore(store: LocalBoardBackupStoreV1): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* Speicher voll / privater Modus */
  }
}

export function pruneLocalBoardBackupEntries(
  entries: LocalBoardBackupEntry[],
  nowMs = Date.now(),
): LocalBoardBackupEntry[] {
  const cutoff = nowMs - RETENTION_MS;
  return entries.filter((e) => {
    const t = Date.parse(e.savedAt);
    return Number.isFinite(t) && t >= cutoff;
  });
}

function shouldAddSnapshot(
  entries: LocalBoardBackupEntry[],
  json: string,
  nowMs: number,
  force: boolean,
): boolean {
  if (force || entries.length === 0) return true;
  const latest = entries[entries.length - 1]!;
  const latestMs = Date.parse(latest.savedAt);
  if (!boardExportTextsEquivalent(latest.json, json)) return true;
  if (!Number.isFinite(latestMs)) return true;
  return nowMs - latestMs >= MIN_INTERVAL_MS;
}

function appendSnapshot(
  entries: LocalBoardBackupEntry[],
  json: string,
  nowMs: number,
  force: boolean,
): LocalBoardBackupEntry[] {
  let next = pruneLocalBoardBackupEntries(entries, nowMs);
  if (!shouldAddSnapshot(next, json, nowMs, force)) return next;
  next = [...next, { savedAt: new Date(nowMs).toISOString(), json }];
  if (next.length > MAX_ENTRIES) {
    next = next.slice(next.length - MAX_ENTRIES);
  }
  return next;
}

export function writeLocalBoardBackup(json: string, nowMs = Date.now()): void {
  if (!json.trim()) return;
  const store = readStore();
  const next = appendSnapshot(store.entries, json, nowMs, false);
  if (next === store.entries) return;
  writeStore({ version: 1, entries: next });
}

/** Sofort sichern (Tab schließen, App in den Hintergrund). */
export function flushLocalBoardBackup(json: string, nowMs = Date.now()): void {
  if (!json.trim()) return;
  const store = readStore();
  const next = appendSnapshot(store.entries, json, nowMs, true);
  writeStore({ version: 1, entries: next });
}

export function listLocalBoardBackups(nowMs = Date.now()): LocalBoardBackupListItem[] {
  const entries = pruneLocalBoardBackupEntries(readStore().entries, nowMs);
  return [...entries]
    .reverse()
    .map((e) => {
      const payload = boardImportPayloadFromExportText(e.json);
      return {
        savedAt: e.savedAt,
        rootCount: payload?.roots.length ?? 0,
      };
    });
}

export function getLocalBoardBackupEntry(savedAt: string): LocalBoardBackupEntry | null {
  const trimmed = savedAt.trim();
  if (!trimmed) return null;
  const entry = readStore().entries.find((e) => e.savedAt === trimmed);
  return entry ?? null;
}

export function latestLocalBoardBackupSavedAt(nowMs = Date.now()): string | null {
  const entries = pruneLocalBoardBackupEntries(readStore().entries, nowMs);
  const latest = entries[entries.length - 1];
  return latest?.savedAt ?? null;
}
