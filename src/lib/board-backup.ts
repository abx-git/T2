/**
 * Local board backups (download / optional File System Access overwrite).
 * History mode: timestamped copies. Rolling mode: always the same backup file.
 */

import {
  boardJsonFromStoreState,
  boardPersistKeyFromStoreState,
} from "@/lib/file-board-reconcile";
import {
  getWorkingFileLabel,
  isWorkingFileAttached,
  isWorkingFileDirty,
} from "@/lib/working-file";
import { useTaskTreeStore } from "@/store/task-tree-store";

export const BACKUP_INTERVAL_OPTIONS_MINUTES = [0, 5, 10, 15, 30] as const;
export type BackupIntervalMinutes = (typeof BACKUP_INTERVAL_OPTIONS_MINUTES)[number];

/** `history` = timestamped copies; `rolling` = overwrite one fixed backup file. */
export const BACKUP_HISTORY_MODES = ["history", "rolling"] as const;
export type BackupHistoryMode = (typeof BACKUP_HISTORY_MODES)[number];

const LS_INTERVAL = "t2-backup-interval-minutes";
const LS_LAST_AT = "t2-backup-last-at";
const LS_HISTORY_MODE = "t2-backup-history-mode";

const LOCAL_BACKUP_IDB_NAME = "t2-board-backups";
const LOCAL_BACKUP_IDB_VERSION = 1;
const LOCAL_BACKUP_STORE = "backups";
const LOCAL_BACKUP_LIST_KEY = "recent";
const LOCAL_BACKUP_ROLLING_HANDLE_KEY = "rolling-handle";
const LOCAL_BACKUP_LIMIT = 12;
const ROLLING_BACKUP_RECORD_ID = "rolling";

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

/** In-memory cache of the rolling backup file handle (FS Access). */
let rollingBackupHandle: FileSystemFileHandle | null = null;

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

export function buildBackupFilename(
  title: string,
  date: Date = new Date(),
  mode: BackupHistoryMode = "history",
): string {
  const slug = slugForBackupFilename(title);
  if (mode === "rolling") {
    return `${slug}-backup.json`;
  }
  return `${slug}-backup-${formatBackupTimestamp(date)}.json`;
}

function isFileSystemAccessAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.showSaveFilePicker === "function" &&
    typeof indexedDB !== "undefined"
  );
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

async function idbGetRollingHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const db = await openLocalBackupDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(LOCAL_BACKUP_STORE, "readonly");
      const r = tx.objectStore(LOCAL_BACKUP_STORE).get(LOCAL_BACKUP_ROLLING_HANDLE_KEY);
      r.onsuccess = () => {
        const raw = r.result;
        resolve(raw && typeof raw === "object" ? (raw as FileSystemFileHandle) : null);
      };
      r.onerror = () => reject(r.error ?? new Error("indexedDB get failed"));
    });
  } catch {
    return null;
  }
}

async function idbPutRollingHandle(handle: FileSystemFileHandle | null): Promise<void> {
  const db = await openLocalBackupDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(LOCAL_BACKUP_STORE, "readwrite");
    const store = tx.objectStore(LOCAL_BACKUP_STORE);
    if (handle) store.put(handle, LOCAL_BACKUP_ROLLING_HANDLE_KEY);
    else store.delete(LOCAL_BACKUP_ROLLING_HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB put failed"));
  });
}

async function ensureReadWritePermission(handle: FileSystemFileHandle): Promise<boolean> {
  try {
    let ok = (await handle.queryPermission({ mode: "readwrite" })) === "granted";
    if (!ok) ok = (await handle.requestPermission({ mode: "readwrite" })) === "granted";
    return ok;
  } catch {
    return false;
  }
}

/** Resolve / cache the rolling backup file handle (if previously chosen). */
export async function getRollingBackupHandle(): Promise<FileSystemFileHandle | null> {
  if (rollingBackupHandle) return rollingBackupHandle;
  const stored = await idbGetRollingHandle();
  rollingBackupHandle = stored;
  return stored;
}

export async function clearRollingBackupHandle(): Promise<void> {
  rollingBackupHandle = null;
  try {
    await idbPutRollingHandle(null);
  } catch {
    /* ignore */
  }
}

/**
 * Pick (or re-pick) the single rolling backup file. Needs a user gesture.
 * Returns null if cancelled or FS Access unavailable.
 */
export async function pickRollingBackupFile(
  suggestedName: string,
): Promise<FileSystemFileHandle | null> {
  if (!isFileSystemAccessAvailable() || !window.showSaveFilePicker) return null;
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName,
      types: [
        {
          description: "T2 Board JSON",
          accept: { "application/json": [".json"] },
        },
      ],
    });
    rollingBackupHandle = handle;
    await idbPutRollingHandle(handle);
    return handle;
  } catch {
    return null;
  }
}

/**
 * Ensure a rolling backup target exists. Uses remembered handle when possible;
 * with `allowPick` may open a save picker (user gesture required).
 */
export async function ensureRollingBackupHandle(
  suggestedName: string,
  options?: { allowPick?: boolean },
): Promise<FileSystemFileHandle | null> {
  const existing = await getRollingBackupHandle();
  if (existing) {
    if (await ensureReadWritePermission(existing)) return existing;
    await clearRollingBackupHandle();
  }
  if (!options?.allowPick) return null;
  return pickRollingBackupFile(suggestedName);
}

async function writeRollingBackupFile(
  handle: FileSystemFileHandle,
  json: string,
): Promise<boolean> {
  try {
    if (!(await ensureReadWritePermission(handle))) return false;
    const writable = await handle.createWritable({ keepExistingData: false });
    await writable.write(json);
    await writable.close();
    return true;
  } catch (e) {
    console.error("Rolling backup write:", e);
    return false;
  }
}

function triggerDownload(json: string, filename: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Persist a backup copy in IndexedDB so it can be reopened without the Downloads folder. */
export async function rememberLocalBackup(
  filename: string,
  json: string,
  createdAt: number = Date.now(),
  mode: BackupHistoryMode = readBackupHistoryMode(),
): Promise<LocalBackupRecord> {
  const record: LocalBackupRecord = {
    id:
      mode === "rolling"
        ? ROLLING_BACKUP_RECORD_ID
        : `${createdAt}-${Math.random().toString(36).slice(2, 9)}`,
    filename,
    createdAt,
    json,
  };
  try {
    const existing = await idbGetLocalBackups();
    const next =
      mode === "rolling"
        ? [
            record,
            ...existing.filter(
              (e) => e.id !== ROLLING_BACKUP_RECORD_ID && e.filename !== filename,
            ),
          ].slice(0, LOCAL_BACKUP_LIMIT)
        : [record, ...existing.filter((e) => e.filename !== filename)].slice(
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
  await clearRollingBackupHandle();
}

/**
 * Download or overwrite a backup. Rolling + FS Access prefers writing the same file.
 */
export async function downloadBoardBackup(
  json: string,
  title: string,
  date: Date = new Date(),
  options?: { mode?: BackupHistoryMode; allowPickRollingFile?: boolean },
): Promise<string> {
  const mode = options?.mode ?? readBackupHistoryMode();
  const filename = buildBackupFilename(title, date, mode);

  if (mode === "rolling" && isFileSystemAccessAvailable()) {
    const handle = await ensureRollingBackupHandle(filename, {
      allowPick: options?.allowPickRollingFile === true,
    });
    if (handle && (await writeRollingBackupFile(handle, json))) {
      rememberLastBackupAt(date.getTime());
      void rememberLocalBackup(filename, json, date.getTime(), mode);
      return filename;
    }
  }

  triggerDownload(json, filename);
  rememberLastBackupAt(date.getTime());
  void rememberLocalBackup(filename, json, date.getTime(), mode);
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
  | { skipped: true; reason: "empty" | "unchanged" | "already_saved" };

/**
 * True when a safety backup is warranted: board has content and is not synced
 * to the Arbeitsdatei (dirty or no Sync-Ziel yet).
 */
export function boardNeedsSafetyBackup(): boolean {
  if (!boardHasBackupContent()) return false;
  if (isWorkingFileAttached()) return isWorkingFileDirty();
  return true;
}

/** Create a backup of the current editor board (history or rolling per setting). */
export async function createBoardBackupNow(options?: {
  allowEmpty?: boolean;
  onlyIfChanged?: boolean;
  allowPickRollingFile?: boolean;
}): Promise<CreateBoardBackupResult> {
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
  const filename = await downloadBoardBackup(json, backupTitleFromStore(), new Date(), {
    allowPickRollingFile: options?.allowPickRollingFile,
  });
  lastBackupPersistKey = persistKey;
  return { filename, skipped: false };
}

export type SuspiciousSwitchKind = "file" | "import";

const LAST_SWITCH_BACKUP_AT: Partial<Record<SuspiciousSwitchKind | "any", number>> = {};

/**
 * Safety backup before replacing board content
 * (andere Datei öffnen, Backup einspielen).
 * Debounced per kind so confirm-dialogs don't double-download.
 */
export async function backupBeforeSuspiciousSwitch(
  kind: SuspiciousSwitchKind,
  options?: { allowEmpty?: boolean; debounceMs?: number; force?: boolean },
): Promise<
  | { filename: string; skipped: false }
  | { skipped: true; reason: "empty" | "debounced" | "unchanged" | "already_saved" }
> {
  if (!options?.force && !boardNeedsSafetyBackup()) {
    return { skipped: true, reason: "already_saved" };
  }
  const debounceMs = options?.debounceMs ?? 2000;
  const now = Date.now();
  const lastKind = LAST_SWITCH_BACKUP_AT[kind] ?? 0;
  const lastAny = LAST_SWITCH_BACKUP_AT.any ?? 0;
  if (now - lastKind < debounceMs || now - lastAny < Math.min(debounceMs, 1500)) {
    return { skipped: true, reason: "debounced" };
  }
  const result = await createBoardBackupNow({ allowEmpty: options?.allowEmpty ?? false });
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

export function readBackupHistoryMode(): BackupHistoryMode {
  if (typeof localStorage === "undefined") return "history";
  try {
    const raw = localStorage.getItem(LS_HISTORY_MODE);
    if (raw && (BACKUP_HISTORY_MODES as readonly string[]).includes(raw)) {
      return raw as BackupHistoryMode;
    }
  } catch {
    /* ignore */
  }
  return "history";
}

export function writeBackupHistoryMode(mode: BackupHistoryMode): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LS_HISTORY_MODE, mode);
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
