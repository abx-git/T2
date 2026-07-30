/**
 * Timestamped local board backups (download copies, independent of the working file).
 */

import {
  boardJsonFromStoreState,
  boardPersistKeyFromStoreState,
} from "@/lib/file-board-reconcile";
import { getWorkingFileLabel } from "@/lib/working-file";
import { useTaskTreeStore } from "@/store/task-tree-store";

export const BACKUP_INTERVAL_OPTIONS_MINUTES = [0, 5, 10, 15, 30] as const;
export type BackupIntervalMinutes = (typeof BACKUP_INTERVAL_OPTIONS_MINUTES)[number];

const LS_INTERVAL = "t2-backup-interval-minutes";
const LS_LAST_AT = "t2-backup-last-at";

const LOCAL_BACKUP_IDB_NAME = "t2-board-backups";
const LOCAL_BACKUP_IDB_VERSION = 1;
const LOCAL_BACKUP_STORE = "backups";
const LOCAL_BACKUP_LIST_KEY = "recent";
const LOCAL_BACKUP_LIMIT = 12;

export interface LocalBackupRecord {
  id: string;
  filename: string;
  createdAt: number;
  json: string;
}

export interface LocalBackupListItem {
  id: string;
  filename: string;
  createdAt: number;
}

/** Persist key of the last successful backup (session); used to skip unchanged auto-backups. */
let lastBackupPersistKey: string | null = null;

export function boardHasBackupContent(): boolean {
  const s = useTaskTreeStore.getState();
  return s.roots.length > 0 || s.clipboardRoots.length > 0;
}

/** Title/slug source for backup filenames (Arbeitsdatei → erste Wurzelkarte → Fallback). */
export function backupTitleFromStore(): string {
  const label = getWorkingFileLabel()?.trim();
  if (label) {
    return label.replace(/\.json$/i, "") || "t2-board";
  }
  const first = useTaskTreeStore.getState().roots[0]?.title?.trim();
  return first || "t2-board";
}

export function slugForBackupFilename(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_äöüß]/gi, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "t2-board";
}

/** Local timestamp suitable for filenames: 2026-07-23-070015 */
export function formatBackupTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

export function buildBackupFilename(title: string, date: Date = new Date()): string {
  return `${slugForBackupFilename(title)}-backup-${formatBackupTimestamp(date)}.json`;
}

function openLocalBackupDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(LOCAL_BACKUP_IDB_NAME, LOCAL_BACKUP_IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LOCAL_BACKUP_STORE)) {
        db.createObjectStore(LOCAL_BACKUP_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
}

async function idbGetLocalBackups(): Promise<LocalBackupRecord[]> {
  try {
    const db = await openLocalBackupDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(LOCAL_BACKUP_STORE, "readonly");
      const r = tx.objectStore(LOCAL_BACKUP_STORE).get(LOCAL_BACKUP_LIST_KEY);
      r.onsuccess = () => {
        const raw = r.result;
        resolve(Array.isArray(raw) ? (raw as LocalBackupRecord[]) : []);
      };
      r.onerror = () => reject(r.error ?? new Error("indexedDB get failed"));
    });
  } catch {
    return [];
  }
}

async function idbPutLocalBackups(entries: LocalBackupRecord[]): Promise<void> {
  const db = await openLocalBackupDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(LOCAL_BACKUP_STORE, "readwrite");
    tx.objectStore(LOCAL_BACKUP_STORE).put(entries, LOCAL_BACKUP_LIST_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB put failed"));
  });
}

/** Persist a backup copy in IndexedDB so it can be reopened without the Downloads folder. */
export async function rememberLocalBackup(
  filename: string,
  json: string,
  createdAt: number = Date.now(),
): Promise<LocalBackupRecord> {
  const record: LocalBackupRecord = {
    id: `${createdAt}-${Math.random().toString(36).slice(2, 9)}`,
    filename,
    createdAt,
    json,
  };
  try {
    const existing = await idbGetLocalBackups();
    const next = [record, ...existing.filter((e) => e.filename !== filename)].slice(
      0,
      LOCAL_BACKUP_LIMIT,
    );
    await idbPutLocalBackups(next);
  } catch (e) {
    console.error("Local backup store:", e);
  }
  return record;
}

/** Recent local backups (metadata only), newest first. */
export async function listLocalBackups(): Promise<LocalBackupListItem[]> {
  const entries = await idbGetLocalBackups();
  return entries.map(({ id, filename, createdAt }) => ({ id, filename, createdAt }));
}

export async function getLocalBackup(id: string): Promise<LocalBackupRecord | null> {
  const entries = await idbGetLocalBackups();
  return entries.find((e) => e.id === id) ?? null;
}

/** @internal test helper */
export async function clearLocalBackups(): Promise<void> {
  try {
    await idbPutLocalBackups([]);
  } catch {
    /* ignore */
  }
}

export function downloadBoardBackup(json: string, title: string, date: Date = new Date()): string {
  const filename = buildBackupFilename(title, date);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  rememberLastBackupAt(date.getTime());
  void rememberLocalBackup(filename, json, date.getTime());
  return filename;
}

/**
 * Treat the current editor stand as already backed up (no download).
 * Used when enabling interval backups so the first tick only fires after a real change.
 */
export function rememberBackupBaselineFromStore(): void {
  lastBackupPersistKey = boardPersistKeyFromStoreState();
}

/** @internal test helper */
export function getLastBackupPersistKey(): string | null {
  return lastBackupPersistKey;
}

/** @internal test helper */
export function resetLastBackupPersistKey(): void {
  lastBackupPersistKey = null;
}

export type CreateBoardBackupResult =
  | { filename: string; skipped: false }
  | { skipped: true; reason: "empty" | "unchanged" };

/** Create a timestamped backup of the current editor board. */
export function createBoardBackupNow(
  options?: { allowEmpty?: boolean; onlyIfChanged?: boolean },
): CreateBoardBackupResult {
  if (!options?.allowEmpty && !boardHasBackupContent()) {
    return { skipped: true, reason: "empty" };
  }
  const persistKey = boardPersistKeyFromStoreState();
  if (
    options?.onlyIfChanged &&
    lastBackupPersistKey !== null &&
    persistKey === lastBackupPersistKey
  ) {
    return { skipped: true, reason: "unchanged" };
  }
  const json = boardJsonFromStoreState();
  const filename = downloadBoardBackup(json, backupTitleFromStore());
  lastBackupPersistKey = persistKey;
  return { filename, skipped: false };
}

export type SuspiciousSwitchKind = "file" | "import";

const LAST_SWITCH_BACKUP_AT: Partial<Record<SuspiciousSwitchKind | "any", number>> = {};

/**
 * Download a safety backup before replacing board content
 * (andere Datei öffnen, Backup einspielen).
 * Debounced per kind so confirm-dialogs don't double-download.
 */
export function backupBeforeSuspiciousSwitch(
  kind: SuspiciousSwitchKind,
  options?: { allowEmpty?: boolean; debounceMs?: number },
): { filename: string; skipped: false } | { skipped: true; reason: "empty" | "debounced" | "unchanged" } {
  const debounceMs = options?.debounceMs ?? 2000;
  const now = Date.now();
  const lastKind = LAST_SWITCH_BACKUP_AT[kind] ?? 0;
  const lastAny = LAST_SWITCH_BACKUP_AT.any ?? 0;
  if (now - lastKind < debounceMs || now - lastAny < Math.min(debounceMs, 1500)) {
    return { skipped: true, reason: "debounced" };
  }
  const result = createBoardBackupNow({ allowEmpty: options?.allowEmpty ?? false });
  if (!result.skipped) {
    LAST_SWITCH_BACKUP_AT[kind] = now;
    LAST_SWITCH_BACKUP_AT.any = now;
  }
  return result;
}

/** @internal test helper */
export function resetSuspiciousSwitchBackupDebounce(): void {
  for (const key of Object.keys(LAST_SWITCH_BACKUP_AT) as Array<
    keyof typeof LAST_SWITCH_BACKUP_AT
  >) {
    delete LAST_SWITCH_BACKUP_AT[key];
  }
}

export function readBackupIntervalMinutes(): BackupIntervalMinutes {
  if (typeof localStorage === "undefined") return 0;
  try {
    const raw = Number(localStorage.getItem(LS_INTERVAL));
    if ((BACKUP_INTERVAL_OPTIONS_MINUTES as readonly number[]).includes(raw)) {
      return raw as BackupIntervalMinutes;
    }
  } catch {
    /* ignore */
  }
  return 0;
}

export function writeBackupIntervalMinutes(minutes: BackupIntervalMinutes): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LS_INTERVAL, String(minutes));
  } catch {
    /* ignore */
  }
}

export function readLastBackupAt(): number | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = Number(localStorage.getItem(LS_LAST_AT));
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  } catch {
    return null;
  }
}

export function rememberLastBackupAt(ms: number = Date.now()): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LS_LAST_AT, String(ms));
  } catch {
    /* ignore */
  }
}

export function formatLastBackupLabel(ms: number | null, locale = "de-DE"): string {
  if (!ms) return "Noch kein Backup";
  return `Zuletzt: ${new Date(ms).toLocaleString(locale)}`;
}
