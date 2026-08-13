/**
 * Arbeitsdatei (File System Access API): einziges Speichermedium.
 * Handles / mirrors are keyed by unique `wf` slot ids (URL `?wf=`) so tabs can
 * open different files even when basenames match (e.g. t2-board.json).
 */

import {
  applyBoardJsonToStore,
  boardJsonFromStoreState,
  boardStatesEquivalent,
  planFileReconcile,
} from "@/lib/file-board-reconcile";
import { boardImportPayloadFromExportText, downloadTextFile } from "@/lib/task-tree-json";
import { useTaskTreeStore } from "@/store/task-tree-store";
import {
  bindTabWorkingFile,
  createWorkingFileId,
  normalizeWorkingFilename,
  resolvePreferredWorkingFileId,
  resolvePreferredWorkingFileName,
} from "@/lib/working-file-tab-context";
import { evaluateWorkingFileWriteGate, mayAutoRestoreWorkingFileFromStorage } from "@/lib/working-file-safety";
import {
  assertSafeWorkingFileWrite,
  boardContentHash,
} from "@/lib/working-file-write-fence";
import {
  ensureWorkingFileWriter,
  isWorkingFileWriterLeader,
  stopWorkingFileWriter,
  supportsWorkingFileWebLocks,
} from "@/lib/working-file-writer";

export const STANDARD_WORKING_FILENAME = "t2-board.json";

const IDB_NAME = "t2-working-file";
const IDB_VERSION = 1;
const IDB_STORE = "handles";
/** Legacy singleton keys (pre multi-tab); migrated on read. */
export const LEGACY_IDB_HANDLE_KEY = "board-json";
export const LEGACY_IDB_MOBILE_KEY = "mobile-working-copy";
const IDB_RECENT_KEY = "recent-working-files";
const LS_LAST_FILE_NAME = "t2-last-working-file-name";
const RECENT_WORKING_FILES_LIMIT = 8;

/** Active slot id for this tab's Arbeitsdatei (URL `wf` / session). */
let activeWorkingFileId: string | null = null;

function looksLikeWorkingFileId(key: string): boolean {
  const t = key.trim();
  return t.length >= 32 || t.startsWith("wf-") || /^[0-9a-f-]{36}$/i.test(t);
}

export function workingFileHandleIdbKey(wfOrFileName: string): string {
  const key = wfOrFileName.trim() || STANDARD_WORKING_FILENAME;
  if (looksLikeWorkingFileId(key)) return `handle:${key}`;
  const normalized =
    normalizeWorkingFilename(key) || normalizeWorkingFilename(STANDARD_WORKING_FILENAME);
  return `handle:${normalized}`;
}

export function workingFileMobileIdbKey(wfOrFileName: string): string {
  const key = wfOrFileName.trim() || STANDARD_WORKING_FILENAME;
  if (looksLikeWorkingFileId(key)) return `mobile:${key}`;
  const normalized =
    normalizeWorkingFilename(key) || normalizeWorkingFilename(STANDARD_WORKING_FILENAME);
  return `mobile:${normalized}`;
}

function nameIndexIdbKey(fileName: string): string {
  const normalized =
    normalizeWorkingFilename(fileName) || normalizeWorkingFilename(STANDARD_WORKING_FILENAME);
  return `name-index:${normalized}`;
}

function syncTabContextAndWriter(
  fileName: string | null,
  wf: string | null = activeWorkingFileId,
): void {
  activeWorkingFileId = wf?.trim() || null;
  bindTabWorkingFile(activeWorkingFileId, fileName);
  if (activeWorkingFileId) {
    ensureWorkingFileWriter(activeWorkingFileId);
  } else {
    stopWorkingFileWriter();
  }
}

export function getActiveWorkingFileId(): string | null {
  return activeWorkingFileId;
}

export interface RecentWorkingFileRecord {
  name: string;
  openedAt: number;
  handle: FileSystemFileHandle;
  wf?: string;
}

let memoryHandle: FileSystemFileHandle | null = null;
let mobileWorkingFileName: string | null = null;

interface MobileWorkingCopyRecord {
  fileName: string;
  json: string;
  sourceLastModified: number;
  wf?: string;
}

let lastSyncedBoardJson: string | null = null;
/** Content hash of lastSyncedBoardJson (stableBoardStateKey); used for content CAS. */
let lastSyncedContentHash: string | null = null;
let lastKnownFileModified = 0;
let suppressExternalPollUntil = 0;
let sessionHydrated = false;
/** Why persist is paused (foreign load / collab) — for UI status. */
let workingFilePersistPauseReason: string | null = null;

export function wasWorkingFileSessionHydrated(): boolean {
  return sessionHydrated;
}

export function markWorkingFileSessionHydrated(): void {
  sessionHydrated = true;
}

export function clearWorkingFileSessionHydrated(): void {
  sessionHydrated = false;
}

const OWN_WRITE_SUPPRESS_MS = 1500;

/** When true, working-file must never push disk content into the editor (collab/join). */
let workingFileToStoreBlocked = false;

export function setWorkingFileToStoreBlocked(blocked: boolean): void {
  workingFileToStoreBlocked = blocked;
}

export function isWorkingFileToStoreBlocked(): boolean {
  return workingFileToStoreBlocked;
}

/** Extend external-poll suppression (e.g. after join while mirroring room → file). */
export function suppressWorkingFileExternalPoll(ms: number): void {
  suppressExternalPollUntil = Math.max(suppressExternalPollUntil, Date.now() + Math.max(0, ms));
}

export type WriteWorkingFileResult =
  | { ok: true; lastModified: number }
  | {
      ok: false;
      reason:
        | "no_handle"
        | "permission_denied"
        | "conflict"
        | "io_error"
        | "not_writer"
        | "url_context_mismatch"
        | "persist_paused"
        | "empty_over_nonempty"
        | "content_cas_mismatch"
        | "unknown_disk_baseline";
      message?: string;
      /** Disk snapshot when write was refused due to external change (caller may safety-download). */
      diskJson?: string;
    };

export function isWorkingFileSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.showOpenFilePicker === "function" &&
    typeof window.showSaveFilePicker === "function"
  );
}

export function isMobileWorkingFileEnvironment(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function prefersBrowserFilePicker(): boolean {
  return isMobileWorkingFileEnvironment();
}

export function isWorkingFileUiAvailable(): boolean {
  return isWorkingFileSupported() || prefersBrowserFilePicker();
}

export function isMobileWorkingFileMode(): boolean {
  return mobileWorkingFileName !== null && memoryHandle === null;
}

export function isUserAgentLikelyBrave(): boolean {
  return typeof navigator !== "undefined" && /\bBrave\b/i.test(navigator.userAgent);
}

export function fileSystemAccessUnavailableTooltip(): string {
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return "Arbeitsdatei: Seite über https:// oder http://localhost öffnen.";
  }
  if (isUserAgentLikelyBrave()) {
    return "Brave: brave://flags/#file-system-access-api → Enabled, Browser neu starten.";
  }
  return "Arbeitsdatei: Chrome, Edge oder Brave (mit File-System-API). Sonst Export (Download).";
}

export function fileSystemAccessUnavailableMessage(): string {
  const lines: string[] = [];

  if (typeof window !== "undefined" && window.isSecureContext === false) {
    lines.push(
      "Die Seite läuft nicht in einem sicheren Kontext. Die Datei-API steht dann oft nicht zur Verfügung — bitte https:// oder http://localhost verwenden.",
    );
  }

  if (isUserAgentLikelyBrave()) {
    lines.push(
      "Brave schaltet die File-System-API standardmäßig ab. „brave://flags/#file-system-access-api“ → Enabled, Browser neu starten.",
    );
  } else {
    lines.push(
      "Die Arbeitsdatei nutzt die File-System-API. Bitte Chrome, Edge oder Brave (mit aktivierter API) verwenden.",
    );
  }

  lines.push("In Safari und Firefox ist die API nicht verfügbar; dort bitte Export (Download) nutzen.");

  return lines.join("\n\n");
}

export function getWorkingFileHandle(): FileSystemFileHandle | null {
  return memoryHandle;
}

export function isWorkingFileAttached(): boolean {
  return memoryHandle !== null || mobileWorkingFileName !== null;
}

/** When true, WorkingFileSync must not auto-write (foreign load / collab). */
let workingFilePersistPaused = false;
/** True while switching Arbeitsdatei (attach → hydrate). Blocks autosave into the new handle. */
let workingFileSwitchInProgress = false;

export function setWorkingFilePersistPaused(paused: boolean, reason?: string | null): void {
  workingFilePersistPaused = paused;
  workingFilePersistPauseReason = paused ? reason?.trim() || "paused" : null;
}

export function isWorkingFilePersistPaused(): boolean {
  return workingFilePersistPaused;
}

export function getWorkingFilePersistPauseReason(): string | null {
  return workingFilePersistPauseReason;
}

export function isWorkingFileSwitchInProgress(): boolean {
  return workingFileSwitchInProgress;
}

/** Call before attaching a new handle; blocks autosave until hydrate finishes. */
export function beginWorkingFileSwitch(): void {
  workingFileSwitchInProgress = true;
  setWorkingFilePersistPaused(true, "file_switch");
  clearWorkingFileSyncState();
  notifyWorkingFilePersistPaused();
}

/** Call after hydrate / Save As write completes (or on failure after detach). */
export function endWorkingFileSwitch(opts?: { keepPaused?: boolean; pauseReason?: string }): void {
  workingFileSwitchInProgress = false;
  if (opts?.keepPaused) {
    setWorkingFilePersistPaused(true, opts.pauseReason ?? "paused");
  } else if (workingFilePersistPauseReason === "file_switch") {
    setWorkingFilePersistPaused(false);
  }
  notifyWorkingFilePersistPaused();
}

export function markWorkingFileSynced(json: string, fileLastModified: number): void {
  lastSyncedBoardJson = json;
  lastSyncedContentHash = boardContentHash(json);
  lastKnownFileModified = fileLastModified;
}

export function getLastSyncedContentHash(): string | null {
  return lastSyncedContentHash;
}

export function noteOwnWriteToWorkingFile(json: string, fileLastModified: number): void {
  markWorkingFileSynced(json, fileLastModified);
  suppressExternalPollUntil = Date.now() + OWN_WRITE_SUPPRESS_MS;
  void persistBrowserMirror(json, fileLastModified);
}

export function clearWorkingFileSyncState(): void {
  lastSyncedBoardJson = null;
  lastSyncedContentHash = null;
  lastKnownFileModified = 0;
  suppressExternalPollUntil = 0;
}

export function isWorkingFileDirty(currentJson?: string): boolean {
  if (!isWorkingFileAttached()) return false;
  if (workingFilePersistPaused) return false;
  const json = currentJson ?? boardJsonFromStoreState();
  const synced = getLastSyncedBoardJson();
  if (!synced) return json.trim().length > 0;
  return !boardStatesEquivalent(json, synced);
}

/**
 * Load board JSON that is not the attached Arbeitsdatei (backup, remote, paste preview).
 * Pauses autosave so the linked file is never overwritten; use Speichern unter… to persist.
 */
export function loadForeignBoardIntoEditor(
  json: string,
  opts?: { reason?: string },
): boolean {
  if (!json.trim()) return false;
  if (!loadBoardFromJsonText(json)) return false;
  setWorkingFilePersistPaused(true, opts?.reason ?? "foreign_load");
  // Keep attachment for identity/label, but do not mark dirty vs disk.
  clearWorkingFileSyncState();
  markWorkingFileSessionHydrated();
  notifyWorkingFilePersistPaused();
  return true;
}

/** Download a safety copy of disk JSON when a write/conflict is refused. */
export function downloadWorkingFileSafetyCopy(
  json: string,
  kind: "disk" | "editor" = "disk",
): void {
  const base =
    getWorkingFileLabel()?.replace(/\.json$/i, "") ||
    getRememberedWorkingFileName()?.replace(/\.json$/i, "") ||
    "t2-board";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const suffix = kind === "disk" ? "disk-copy" : "editor-copy";
  downloadTextFile(
    `${base}-${suffix}-${stamp}.json`,
    json,
    "application/json",
  );
}

export const WORKING_FILE_PERSIST_PAUSED_EVENT = "t2-working-file-persist-paused";

export function notifyWorkingFilePersistPaused(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(WORKING_FILE_PERSIST_PAUSED_EVENT));
}

/** True when Web Locks are missing — only the focused tab should write. */
export function isWorkingFileMultiTabUnsafe(): boolean {
  return typeof window !== "undefined" && !supportsWorkingFileWebLocks();
}

export function getWorkingFileLabel(): string | null {
  if (memoryHandle) return workingFileDisplayName(memoryHandle);
  if (mobileWorkingFileName?.trim()) return mobileWorkingFileName.trim();
  // Do not fall back to localStorage — that is only a restore hint and would show a
  // stale name after „ohne Datei“ / detach.
  return null;
}

export function getRememberedWorkingFileName(): string | null {
  if (typeof localStorage === "undefined") return null;
  const name = localStorage.getItem(LS_LAST_FILE_NAME)?.trim();
  return name || null;
}

function rememberLastFileNameInStorage(fileName: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LS_LAST_FILE_NAME, fileName);
  } catch {
    /* ignore */
  }
}

function clearRememberedFileNameInStorage(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(LS_LAST_FILE_NAME);
  } catch {
    /* ignore */
  }
}

async function persistBrowserMirror(json: string, fileLastModified: number): Promise<void> {
  const fileName =
    workingFileDisplayName(memoryHandle) ??
    mobileWorkingFileName?.trim() ??
    getRememberedWorkingFileName() ??
    STANDARD_WORKING_FILENAME;
  await rememberMobileCopy(json, fileName, fileLastModified);
}

export function shouldSuppressExternalFilePoll(): boolean {
  return Date.now() < suppressExternalPollUntil;
}

export function getLastKnownFileModified(): number {
  return lastKnownFileModified;
}

export function isKnownFileRevision(fileLastModified: number): boolean {
  return fileLastModified > 0 && fileLastModified === lastKnownFileModified;
}

export function getLastSyncedBoardJson(): string | null {
  return lastSyncedBoardJson;
}

export function noteExternalFileRevision(fileLastModified: number): void {
  lastKnownFileModified = fileLastModified;
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
  });
}

async function idbPut<T>(key: string, value: T): Promise<void> {
  const db = await openIdb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("tx"));
      tx.objectStore(IDB_STORE).put(value, key);
    });
  } finally {
    db.close();
  }
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openIdb();
    try {
      return await new Promise<T | null>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        tx.onerror = () => reject(tx.error ?? new Error("tx"));
        const r = tx.objectStore(IDB_STORE).get(key);
        r.onsuccess = () => resolve((r.result as T | undefined) ?? null);
      });
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

async function idbDelete(key: string): Promise<void> {
  try {
    const db = await openIdb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("tx"));
        tx.objectStore(IDB_STORE).delete(key);
      });
    } finally {
      db.close();
    }
  } catch {
    /* ignore */
  }
}

async function idbPutHandle(
  handle: FileSystemFileHandle,
  fileName: string,
  wf: string,
): Promise<void> {
  const name = fileName.trim() || handle.name?.trim() || STANDARD_WORKING_FILENAME;
  const id = wf.trim() || createWorkingFileId();
  await idbPut(workingFileHandleIdbKey(id), handle);
  await idbPut(nameIndexIdbKey(name), id);
  // Drop legacy singleton so other tabs are not restored to the wrong file.
  await idbDelete(LEGACY_IDB_HANDLE_KEY);
  // Drop legacy name-only slot for this basename (avoid colliding with other paths).
  const legacyNameKey = `handle:${normalizeWorkingFilename(name) || normalizeWorkingFilename(STANDARD_WORKING_FILENAME)}`;
  if (legacyNameKey !== workingFileHandleIdbKey(id)) {
    await idbDelete(legacyNameKey);
  }
}

async function idbResolveWf(
  preferredWf?: string | null,
  preferredFileName?: string | null,
  opts?: { allowNameIndex?: boolean },
): Promise<string | null> {
  const wf = preferredWf?.trim() || null;
  if (wf) {
    const handle = await idbGet<FileSystemFileHandle>(workingFileHandleIdbKey(wf));
    if (handle) return wf;
    const mobile = await idbGet<MobileWorkingCopyRecord>(workingFileMobileIdbKey(wf));
    if (mobile) return wf;
  }

  // Basename index is last-writer-wins across tabs — never use for auto-restore.
  if (opts?.allowNameIndex) {
    const preferred = preferredFileName?.trim() || null;
    if (preferred) {
      const indexed = await idbGet<string>(nameIndexIdbKey(preferred));
      if (indexed?.trim()) return indexed.trim();
    }
  }

  return null;
}

async function idbGetHandle(
  preferredWf?: string | null,
  preferredFileName?: string | null,
  opts?: { allowNameIndex?: boolean },
): Promise<FileSystemFileHandle | null> {
  const wf = await idbResolveWf(preferredWf, preferredFileName, opts);
  if (wf) {
    const keyed = await idbGet<FileSystemFileHandle>(workingFileHandleIdbKey(wf));
    if (keyed) return keyed;
  }

  const preferred = preferredFileName?.trim() || null;
  if (preferred) {
    const byName = await idbGet<FileSystemFileHandle>(workingFileHandleIdbKey(preferred));
    if (byName) return byName;
  }

  const legacy = await idbGet<FileSystemFileHandle>(LEGACY_IDB_HANDLE_KEY);
  if (legacy) {
    const legacyName = legacy.name?.trim() || STANDARD_WORKING_FILENAME;
    if (
      !preferred ||
      normalizeWorkingFilename(legacyName) === normalizeWorkingFilename(preferred)
    ) {
      return legacy;
    }
  }

  if (!preferred && !preferredWf) {
    const last = getRememberedWorkingFileName();
    if (last) {
      const indexed = await idbGet<string>(nameIndexIdbKey(last));
      if (indexed?.trim()) {
        const byIndex = await idbGet<FileSystemFileHandle>(workingFileHandleIdbKey(indexed));
        if (byIndex) return byIndex;
      }
      const byLast = await idbGet<FileSystemFileHandle>(workingFileHandleIdbKey(last));
      if (byLast) return byLast;
    }
  }

  return null;
}

async function idbClearHandle(wf?: string | null, fileName?: string | null): Promise<void> {
  const id = wf?.trim() || activeWorkingFileId;
  const name =
    fileName?.trim() ||
    memoryHandle?.name?.trim() ||
    mobileWorkingFileName?.trim() ||
    getRememberedWorkingFileName();
  if (id) await idbDelete(workingFileHandleIdbKey(id));
  if (name) {
    await idbDelete(workingFileHandleIdbKey(name));
    await idbDelete(nameIndexIdbKey(name));
  }
  await idbDelete(LEGACY_IDB_HANDLE_KEY);
}

async function idbPutMobileCopy(record: MobileWorkingCopyRecord): Promise<void> {
  const id = record.wf?.trim() || activeWorkingFileId || createWorkingFileId();
  const withWf = { ...record, wf: id };
  await idbPut(workingFileMobileIdbKey(id), withWf);
  await idbPut(nameIndexIdbKey(record.fileName), id);
  await idbDelete(LEGACY_IDB_MOBILE_KEY);
  const legacyNameKey = `mobile:${normalizeWorkingFilename(record.fileName) || normalizeWorkingFilename(STANDARD_WORKING_FILENAME)}`;
  if (legacyNameKey !== workingFileMobileIdbKey(id)) {
    await idbDelete(legacyNameKey);
  }
}

async function idbGetMobileCopy(
  preferredWf?: string | null,
  preferredFileName?: string | null,
): Promise<MobileWorkingCopyRecord | null> {
  const wf = await idbResolveWf(preferredWf, preferredFileName);
  if (wf) {
    const keyed = await idbGet<MobileWorkingCopyRecord>(workingFileMobileIdbKey(wf));
    if (keyed) return keyed;
  }

  const preferred = preferredFileName?.trim() || null;
  if (preferred) {
    const byName = await idbGet<MobileWorkingCopyRecord>(workingFileMobileIdbKey(preferred));
    if (byName) return byName;
  }

  const legacy = await idbGet<MobileWorkingCopyRecord>(LEGACY_IDB_MOBILE_KEY);
  if (legacy?.fileName?.trim()) {
    if (
      !preferred ||
      normalizeWorkingFilename(legacy.fileName) === normalizeWorkingFilename(preferred)
    ) {
      return legacy;
    }
  }

  if (!preferred && !preferredWf) {
    const last = getRememberedWorkingFileName();
    if (last) {
      const indexed = await idbGet<string>(nameIndexIdbKey(last));
      if (indexed?.trim()) {
        const byIndex = await idbGet<MobileWorkingCopyRecord>(workingFileMobileIdbKey(indexed));
        if (byIndex) return byIndex;
      }
      const byLast = await idbGet<MobileWorkingCopyRecord>(workingFileMobileIdbKey(last));
      if (byLast) return byLast;
    }
  }

  return null;
}

async function idbClearMobileCopy(wf?: string | null, fileName?: string | null): Promise<void> {
  const id = wf?.trim() || activeWorkingFileId;
  const name =
    fileName?.trim() ||
    mobileWorkingFileName?.trim() ||
    memoryHandle?.name?.trim() ||
    getRememberedWorkingFileName();
  if (id) await idbDelete(workingFileMobileIdbKey(id));
  if (name) await idbDelete(workingFileMobileIdbKey(name));
  await idbDelete(LEGACY_IDB_MOBILE_KEY);
}

async function idbGetRecent(): Promise<RecentWorkingFileRecord[]> {
  try {
    const db = await openIdb();
    try {
      const raw = await new Promise<unknown>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        tx.onerror = () => reject(tx.error ?? new Error("tx"));
        const r = tx.objectStore(IDB_STORE).get(IDB_RECENT_KEY);
        r.onsuccess = () => resolve(r.result);
      });
      if (!Array.isArray(raw)) return [];
      return raw.filter(
        (entry): entry is RecentWorkingFileRecord =>
          Boolean(
            entry &&
              typeof entry === "object" &&
              typeof (entry as RecentWorkingFileRecord).name === "string" &&
              typeof (entry as RecentWorkingFileRecord).openedAt === "number" &&
              (entry as RecentWorkingFileRecord).handle,
          ),
      );
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}

async function idbPutRecent(entries: RecentWorkingFileRecord[]): Promise<void> {
  const db = await openIdb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("tx"));
      tx.objectStore(IDB_STORE).put(entries, IDB_RECENT_KEY);
    });
  } finally {
    db.close();
  }
}

/**
 * True only when the File System Access API confirms the same disk entry.
 * Never fall back to basename equality — two `t2-board.json` in different
 * folders would otherwise share one `wf` slot and produce identical bookmark URLs.
 */
async function handlesAreSame(
  a: FileSystemFileHandle,
  b: FileSystemFileHandle,
): Promise<boolean> {
  try {
    if (typeof a.isSameEntry === "function") return await a.isSameEntry(b);
  } catch {
    /* permission revoked / opaque handle */
  }
  return false;
}

async function rememberRecentWorkingFile(
  handle: FileSystemFileHandle,
  wf: string,
): Promise<void> {
  const name = handle.name?.trim() || STANDARD_WORKING_FILENAME;
  const openedAt = Date.now();
  try {
    const existing = await idbGetRecent();
    const next: RecentWorkingFileRecord[] = [{ name, openedAt, handle, wf }];
    for (const entry of existing) {
      if (await handlesAreSame(entry.handle, handle)) continue;
      next.push(entry);
      if (next.length >= RECENT_WORKING_FILES_LIMIT) break;
    }
    await idbPutRecent(next);
  } catch {
    /* ignore */
  }
}

/** Reuse wf for the same disk file (isSameEntry); otherwise allocate a new slot. */
async function resolveWfForHandle(handle: FileSystemFileHandle): Promise<string> {
  if (memoryHandle && activeWorkingFileId) {
    try {
      if (await handlesAreSame(memoryHandle, handle)) return activeWorkingFileId;
    } catch {
      /* ignore */
    }
  }
  try {
    const recent = await idbGetRecent();
    for (const entry of recent) {
      if (!entry.wf?.trim()) continue;
      if (await handlesAreSame(entry.handle, handle)) return entry.wf.trim();
    }
  } catch {
    /* ignore */
  }
  return createWorkingFileId();
}

/** Recent Arbeitsdateien (File System Access handles), newest first. */
export async function listRecentWorkingFiles(): Promise<
  Array<{ name: string; openedAt: number; handle: FileSystemFileHandle }>
> {
  if (!isWorkingFileSupported()) return [];
  return idbGetRecent();
}

export async function clearRecentWorkingFiles(): Promise<void> {
  try {
    await idbPutRecent([]);
  } catch {
    /* ignore */
  }
}

/**
 * Re-open a recent file (must be called from a user gesture for permission).
 * Promotes it to the current Arbeitsdatei and hydrates the editor.
 */
export async function openRecentWorkingFile(
  handle: FileSystemFileHandle,
  options?: { skipPermission?: boolean },
): Promise<{
  handle: FileSystemFileHandle;
  hydrate: HydrateWorkingFileResult;
} | null> {
  if (!isWorkingFileSupported()) return null;
  try {
    if (!options?.skipPermission) {
      const granted = await ensureReadWritePermission(handle);
      if (!granted) return null;
    }
    await rememberHandle(handle);
    return { handle, hydrate: await hydrateStoreFromWorkingFile(handle) };
  } catch (e) {
    console.error("Recent file open:", e);
    return null;
  }
}

/**
 * Request readwrite permission for a remembered handle.
 * Must run from a user gesture *before* any programmatic download (which consumes activation).
 */
export async function requestWorkingFilePermission(
  handle: FileSystemFileHandle,
): Promise<boolean> {
  if (!isWorkingFileSupported()) return false;
  try {
    return await ensureReadWritePermission(handle);
  } catch {
    return false;
  }
}

async function ensureReadWritePermission(handle: FileSystemFileHandle): Promise<boolean> {
  let ok = (await handle.queryPermission({ mode: "readwrite" })) === "granted";
  if (!ok) ok = (await handle.requestPermission({ mode: "readwrite" })) === "granted";
  return ok;
}

/**
 * Picker types for macOS/Chrome: do NOT list compound ".json" — the OS
 * treats the extension as ".json", and ".json" in accept greys out valid boards.
 * Always keep "All files" available (excludeAcceptAllOption: false).
 */
const JSON_PICKER_TYPES: FilePickerAcceptType[] = [
  {
    description: "T2 Board JSON",
    accept: {
      "application/json": [".json"],
      "text/json": [".json"],
    },
  },
];

const OPEN_FILE_PICKER_OPTIONS: OpenFilePickerOptions = {
  multiple: false,
  excludeAcceptAllOption: false,
  types: JSON_PICKER_TYPES,
};

const SAVE_FILE_PICKER_OPTIONS_BASE: Omit<SaveFilePickerOptions, "suggestedName"> = {
  excludeAcceptAllOption: false,
  types: JSON_PICKER_TYPES,
};

export async function readWorkingFileSnapshot(
  handle: FileSystemFileHandle = memoryHandle!,
): Promise<{ text: string; lastModified: number } | null> {
  if (!handle) return null;
  try {
    const file = await handle.getFile();
    return { text: await file.text(), lastModified: file.lastModified };
  } catch (e) {
    console.error("Arbeitsdatei lesen:", e);
    return null;
  }
}

/** Cheap mtime peek for external-change polling (no full text read). */
export async function peekWorkingFileLastModified(
  handle: FileSystemFileHandle = memoryHandle!,
): Promise<number | null> {
  if (!handle) return null;
  try {
    const file = await handle.getFile();
    return file.lastModified;
  } catch {
    return null;
  }
}

/** How often to re-check the Arbeitsdatei for external tool edits (visible tab). */
export const EXTERNAL_WORKING_FILE_POLL_MS = 1000;

export async function writeWorkingFileJson(
  json: string,
  handle: FileSystemFileHandle = memoryHandle!,
  options?: {
    expectedLastModified?: number;
    /** Only for explicit Create / Speichern unter after user picked a path. */
    skipCas?: boolean;
  },
): Promise<WriteWorkingFileResult> {
  if (!handle) return { ok: false, reason: "no_handle" };
  try {
    if (!(await ensureReadWritePermission(handle))) {
      return { ok: false, reason: "permission_denied" };
    }
    const before = await handle.getFile();
    const diskText = await before.text();

    const fence = assertSafeWorkingFileWrite({
      outgoingJson: json,
      diskJson: diskText,
      expectedContentHash: options?.skipCas ? undefined : lastSyncedContentHash,
      skipCas: options?.skipCas,
      requireDiskBaseline: !options?.skipCas,
    });
    if (!fence.ok) {
      return {
        ok: false,
        reason: fence.reason,
        message: fence.message,
        diskJson: diskText,
      };
    }

    const expected =
      options?.skipCas
        ? undefined
        : options?.expectedLastModified !== undefined
          ? options.expectedLastModified
          : lastKnownFileModified > 0
            ? lastKnownFileModified
            : undefined;
    if (expected !== undefined && before.lastModified !== expected) {
      return { ok: false, reason: "conflict", diskJson: diskText, message: "Datei wurde extern geändert." };
    }
    // Without mtime baseline, content fence already ran; still refuse mtime-unknown + skipCas false
    // if disk content hash diverges from synced (handled above).

    const writable = await handle.createWritable({ keepExistingData: false });
    await writable.write(json);
    await writable.close();
    const file = await handle.getFile();
    noteOwnWriteToWorkingFile(json, file.lastModified);
    return { ok: true, lastModified: file.lastModified };
  } catch (e) {
    console.error("Arbeitsdatei schreiben:", e);
    return { ok: false, reason: "io_error", message: "Schreiben fehlgeschlagen — Datei ggf. prüfen." };
  }
}

function loadBoardFromJsonText(text: string): boolean {
  return applyBoardJsonToStore(text);
}

function hydrateFromFileText(fileJson: string, fileLastModified: number): HydrateWorkingFileResult {
  const localJson = boardJsonFromStoreState();

  if (!fileJson.trim()) {
    markWorkingFileSynced(localJson, fileLastModified);
    return { status: "empty" };
  }

  const plan = planFileReconcile(localJson, fileJson);
  if (plan.action === "in_sync" || plan.action === "apply_file") {
    loadBoardFromJsonText(fileJson);
    markWorkingFileSynced(fileJson, fileLastModified);
    return { status: "loaded" };
  }
  if (plan.action === "push_local") {
    markWorkingFileSynced(localJson, fileLastModified);
    return { status: "pushed_local" };
  }
  return { status: "conflict", fileText: fileJson, fileLastModified };
}

/**
 * Explicit „Datei öffnen“: disk always wins. Never push the previous editor into the new file.
 */
function hydrateOpenedFile(fileJson: string, fileLastModified: number): HydrateWorkingFileResult {
  const trimmed = fileJson.trim();
  if (!trimmed) {
    // Empty file → empty editor; do not keep previous board as "synced" (that would autosave into it).
    useTaskTreeStore.getState().replaceBoardFromImport({
      roots: [],
      pathIds: [],
      columnTitleOverrides: {},
    });
    markWorkingFileSynced(fileJson, fileLastModified);
    return { status: "empty" };
  }

  if (!boardImportPayloadFromExportText(trimmed)) {
    return {
      status: "conflict",
      fileText: fileJson,
      fileLastModified,
    };
  }

  if (!loadBoardFromJsonText(trimmed)) {
    return { status: "conflict", fileText: fileJson, fileLastModified };
  }
  markWorkingFileSynced(fileJson, fileLastModified);
  return { status: "loaded" };
}

async function rememberMobileCopy(json: string, fileName: string, sourceLastModified: number): Promise<void> {
  const trimmedName = fileName.trim() || STANDARD_WORKING_FILENAME;
  const wf = activeWorkingFileId || createWorkingFileId();
  activeWorkingFileId = wf;
  mobileWorkingFileName = trimmedName;
  rememberLastFileNameInStorage(trimmedName);
  syncTabContextAndWriter(trimmedName, wf);
  try {
    await idbPutMobileCopy({ fileName: trimmedName, json, sourceLastModified, wf });
  } catch {
    /* ignore */
  }
}

export type HydrateWorkingFileResult =
  | { status: "loaded" | "empty" | "pushed_local" }
  | { status: "conflict"; fileText: string; fileLastModified: number };

export type BrowserFileAttachResult =
  | HydrateWorkingFileResult
  | { status: "read_error"; message: string };

export function normalizeImportedFileText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.charCodeAt(0) === 0xfeff) return trimmed.slice(1);
  return trimmed;
}

/** Chrome-NotReadableError (Cloud-Dateien) in verständliche Anleitung übersetzen. */
export function userFacingFileReadError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();

  if (
    name === "NotReadableError" ||
    lower.includes("could not be read") ||
    lower.includes("permission problem") ||
    lower.includes("permission")
  ) {
    return [
      "Chrome darf diese Datei nicht lesen — das passiert oft, wenn Sie sie direkt aus „Proton Drive“ wählen.",
      "",
      "So funktioniert es:",
      "1. In der Proton-Drive-App die Datei herunterladen oder „Offline verfügbar“ aktivieren",
      "2. In T2 die Datei aus „Downloads“ oder „Dateien auf diesem Gerät“ wählen — nicht aus dem Proton-Drive-Eintrag",
      "",
      "Alternativ: „JSON einfügen“ nutzen (Text aus der Datei auf dem PC kopieren).",
    ].join("\n");
  }

  if (error instanceof Error && error.message.trim()) return error.message;
  return "Datei konnte nicht gelesen werden.";
}

/**
 * Lesen sofort beim Datei-Dialog starten (noch im Event-Handler).
 * Auf Android darf vor dem ersten file.text() kein await liegen.
 */
export function beginUserPickedFileRead(file: File): Promise<string> {
  return readUserPickedFileText(file);
}

/** Liest eine per Datei-Dialog gewählte Datei (Android/Cloud-tauglich). */
export async function readUserPickedFileText(file: File): Promise<string> {
  if (file.size === 0) {
    throw new Error(
      "Die Datei ist leer. Bei Proton Drive die Datei in der App öffnen, „Offline verfügbar“ aktivieren und danach erneut wählen.",
    );
  }

  const strategies: Array<() => Promise<string>> = [
    async () => file.text(),
    async () => {
      const buf = await file.arrayBuffer();
      return new TextDecoder("utf-8", { fatal: false }).decode(buf);
    },
    async () =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error ?? new Error("FileReader fehlgeschlagen"));
        reader.readAsText(file);
      }),
    async () =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const buf = reader.result as ArrayBuffer;
          resolve(new TextDecoder("utf-8", { fatal: false }).decode(buf));
        };
        reader.onerror = () => reject(reader.error ?? new Error("FileReader fehlgeschlagen"));
        reader.readAsArrayBuffer(file);
      }),
  ];

  let lastError: unknown;
  for (const strategy of strategies) {
    try {
      const text = normalizeImportedFileText(await strategy());
      if (!text && file.size > 0) {
        throw new Error("Dateiinhalt konnte nicht gelesen werden.");
      }
      return text;
    } catch (e) {
      lastError = e;
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new Error("Datei konnte nicht gelesen werden.");
}

/** Mobile/Cloud: bind a picked File as the Arbeitsdatei (no FS Access handle). */
export async function bindMobileWorkingFile(file: File, json?: string): Promise<void> {
  const fileName = file.name?.trim() || STANDARD_WORKING_FILENAME;
  const payload = json ?? boardJsonFromStoreState();
  const previousName =
    memoryHandle?.name?.trim() || mobileWorkingFileName?.trim() || null;
  const previousWf = activeWorkingFileId;
  memoryHandle = null;
  await idbClearHandle(previousWf, previousName);
  activeWorkingFileId = createWorkingFileId();
  await rememberMobileCopy(payload, fileName, file.lastModified);
  markWorkingFileSynced(payload, file.lastModified);
  markWorkingFileSessionHydrated();
  notifyWorkingFileAttached();
}

async function attachWorkingFileFromText(
  text: string,
  fileName: string,
  fileLastModified: number,
): Promise<BrowserFileAttachResult> {
  const previousName =
    memoryHandle?.name?.trim() || mobileWorkingFileName?.trim() || null;
  const previousWf = activeWorkingFileId;
  memoryHandle = null;
  await idbClearHandle(previousWf, previousName);

  if (text.trim() && !boardImportPayloadFromExportText(text)) {
    return {
      status: "read_error",
      message:
        'Die Datei ist keine gültige T2-Arbeitsdatei (JSON-Format „hierarchical-task-manager“ erwartet).',
    };
  }

  // New browser-file / paste slot — never reuse another tab's wf.
  activeWorkingFileId = createWorkingFileId();
  clearWorkingFileSyncState();

  const result = hydrateFromFileText(text, fileLastModified);
  if (result.status === "conflict") return result;

  const syncedJson = getLastSyncedBoardJson() ?? text;
  await rememberMobileCopy(syncedJson, fileName, fileLastModified);
  markWorkingFileSessionHydrated();
  return result;
}

async function rememberHandle(handle: FileSystemFileHandle): Promise<void> {
  const fileName = handle.name?.trim() || STANDARD_WORKING_FILENAME;
  const wf = await resolveWfForHandle(handle);

  // Block autosave until hydrate / explicit write finishes — prevents writing the
  // previous board into the newly attached file.
  beginWorkingFileSwitch();

  memoryHandle = handle;
  // File-System-Handle ist die Quelle der Wahrheit — Mobile-Copy-Name nur als Fallback.
  mobileWorkingFileName = null;
  activeWorkingFileId = wf;
  rememberLastFileNameInStorage(fileName);
  // Always refresh URL/session — even when basename is unchanged (wf still changes).
  syncTabContextAndWriter(fileName, wf);
  try {
    await idbPutHandle(handle, fileName, wf);
  } catch {
    /* ignore */
  }
  await rememberRecentWorkingFile(handle, wf);
  try {
    // Clear mobile mirror for this slot only (handle is authoritative).
    await idbClearMobileCopy(wf, fileName);
  } catch {
    /* ignore */
  }
  notifyWorkingFileAttached();
}

export async function attachWorkingFileOpen(): Promise<FileSystemFileHandle | null> {
  if (!isWorkingFileSupported() || !window.showOpenFilePicker) return null;
  try {
    const [handle] = await window.showOpenFilePicker(OPEN_FILE_PICKER_OPTIONS);
    await rememberHandle(handle);
    return handle;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return null;
    throw e;
  }
}

/** Ensure a picker-friendly `.json` file name. */
export function suggestedWorkingFileName(
  titleOrLabel: string | null | undefined,
  fallback: string = STANDARD_WORKING_FILENAME,
): string {
  const raw = titleOrLabel?.trim();
  if (!raw) return fallback;
  if (/\.json$/i.test(raw)) return raw;
  const slug = raw
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${slug || "t2-board"}.json`;
}

export async function attachWorkingFileCreate(
  suggestedName: string = STANDARD_WORKING_FILENAME,
): Promise<FileSystemFileHandle | null> {
  if (!isWorkingFileSupported() || !window.showSaveFilePicker) return null;
  try {
    const handle = await window.showSaveFilePicker({
      ...SAVE_FILE_PICKER_OPTIONS_BASE,
      suggestedName: suggestedWorkingFileName(suggestedName),
    });
    await rememberHandle(handle);
    return handle;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return null;
    throw e;
  }
}

export async function hydrateStoreFromWorkingFile(
  handle: FileSystemFileHandle,
  options?: { intent?: "open" | "reconcile" },
): Promise<HydrateWorkingFileResult> {
  const intent = options?.intent ?? "open";
  try {
    const snap = await readWorkingFileSnapshot(handle);
    if (!snap) {
      endWorkingFileSwitch();
      return { status: "empty" };
    }

    const result =
      intent === "open"
        ? hydrateOpenedFile(snap.text, snap.lastModified)
        : hydrateFromFileText(snap.text, snap.lastModified);

    if (result.status === "conflict") {
      // Keep switch gate up — caller must not autosave previous board into this file.
      // User resolves via dialog; load_file ends switch, keep_local should Speichern unter.
      return result;
    }

    markWorkingFileSessionHydrated();
    const syncedJson = getLastSyncedBoardJson() ?? snap.text;
    const fileName = handle.name?.trim() || STANDARD_WORKING_FILENAME;
    await rememberMobileCopy(syncedJson, fileName, snap.lastModified);
    endWorkingFileSwitch();
    return result;
  } catch (e) {
    console.error("Arbeitsdatei hydrate:", e);
    endWorkingFileSwitch({ keepPaused: true, pauseReason: "hydrate_error" });
    return { status: "empty" };
  }
}

/**
 * Always apply the working-file contents to the editor (no conflict UI).
 * Used when the user explicitly chooses to restore from disk / stash mirror.
 */
export async function forceHydrateFromWorkingFile(
  handle: FileSystemFileHandle,
): Promise<"loaded" | "empty" | "error"> {
  try {
    const snap = await readWorkingFileSnapshot(handle);
    if (!snap) return "empty";
    if (!snap.text.trim()) {
      markWorkingFileSynced(boardJsonFromStoreState(), snap.lastModified);
      markWorkingFileSessionHydrated();
      return "empty";
    }
    if (!loadBoardFromJsonText(snap.text)) return "error";
    markWorkingFileSynced(snap.text, snap.lastModified);
    markWorkingFileSessionHydrated();
    const fileName = handle.name?.trim() || STANDARD_WORKING_FILENAME;
    await rememberMobileCopy(snap.text, fileName, snap.lastModified);
    return "loaded";
  } catch (e) {
    console.error("Arbeitsdatei force-hydrate:", e);
    return "error";
  }
}

/**
 * Apply board JSON for intentional restore into the editor.
 * Does NOT mark the Arbeitsdatei dirty for autosave — use loadForeignBoardIntoEditor
 * for backup/remote, or persistWorkingFileJson after an explicit user save.
 */
export function forceApplyBoardJson(json: string): boolean {
  if (!json.trim()) return false;
  if (!loadBoardFromJsonText(json)) return false;
  markWorkingFileSessionHydrated();
  return true;
}

/**
 * Pause Arbeitsdatei autosave (collab / foreign content). Handle stays attached for label.
 */
export function pauseWorkingFilePersistForCollab(): void {
  setWorkingFilePersistPaused(true, "collab");
  notifyWorkingFilePersistPaused();
}

export function resumeWorkingFilePersistAfterCollab(): void {
  if (workingFilePersistPauseReason === "collab" || workingFilePersistPauseReason === "paused") {
    setWorkingFilePersistPaused(false);
    // Re-sync marker from current editor so we don't immediately dirty-write.
    const json = boardJsonFromStoreState();
    if (lastKnownFileModified > 0) {
      markWorkingFileSynced(json, lastKnownFileModified);
    } else {
      clearWorkingFileSyncState();
    }
    notifyWorkingFilePersistPaused();
  }
}

export async function attachWorkingFileFromBrowserFile(
  file: File,
  preReadText?: string,
): Promise<BrowserFileAttachResult> {
  try {
    const text = preReadText ?? (await readUserPickedFileText(file));
    const fileName = file.name?.trim() || STANDARD_WORKING_FILENAME;
    return await attachWorkingFileFromText(text, fileName, file.lastModified);
  } catch (e) {
    console.error("Arbeitsdatei aus Datei-Dialog:", e);
    return {
      status: "read_error",
      message: userFacingFileReadError(e),
    };
  }
}

export async function attachWorkingFileFromPastedText(
  rawText: string,
  fileName: string = STANDARD_WORKING_FILENAME,
): Promise<BrowserFileAttachResult> {
  try {
    return await attachWorkingFileFromText(normalizeImportedFileText(rawText), fileName, Date.now());
  } catch (e) {
    console.error("Arbeitsdatei aus Text:", e);
    return {
      status: "read_error",
      message: userFacingFileReadError(e),
    };
  }
}

/** Resolve paste/import conflict after attachWorkingFileFrom* returned `conflict`. */
export async function resolveWorkingFileImportConflict(
  choice: "keep_local" | "load_file",
  fileText: string,
  fileLastModified: number,
  fileName: string = STANDARD_WORKING_FILENAME,
): Promise<void> {
  if (choice === "load_file") {
    if (fileText.trim()) loadBoardFromJsonText(fileText);
    markWorkingFileSynced(fileText, fileLastModified);
    await rememberMobileCopy(fileText, fileName, fileLastModified);
    markWorkingFileSessionHydrated();
    endWorkingFileSwitch();
    return;
  }

  // Keep editor — never write the previous board into the file we just opened.
  // Persist stays paused until Speichern unter… / reopen.
  markWorkingFileSessionHydrated();
  endWorkingFileSwitch({ keepPaused: true, pauseReason: "open_keep_local" });
}

export async function persistWorkingFileJson(
  json: string,
  options?: { skipCas?: boolean },
): Promise<WriteWorkingFileResult> {
  if (workingFileSwitchInProgress && !options?.skipCas) {
    return {
      ok: false,
      reason: "persist_paused",
      message: "Dateiwechsel läuft — Speichern in die neue Datei ist blockiert, bis sie geladen ist.",
    };
  }
  if (workingFilePersistPaused && !options?.skipCas) {
    return {
      ok: false,
      reason: "persist_paused",
      message:
        "Speichern in die Arbeitsdatei ist pausiert (fremder Stand oder Kollaboration). Nutze Speichern unter…",
    };
  }

  const gate = evaluateWorkingFileWriteGate({
    attached: isWorkingFileAttached(),
    isWriterLeader: isWorkingFileWriterLeader(),
    activeWf: activeWorkingFileId,
    label: getWorkingFileLabel(),
  });
  if (!gate.ok) {
    const reason =
      gate.reason === "not_writer"
        ? "not_writer"
        : gate.reason === "url_context_mismatch"
          ? "url_context_mismatch"
          : "no_handle";
    return { ok: false, reason, message: gate.message };
  }
  if (gate.shouldRebindUrl) {
    const label = getWorkingFileLabel();
    syncTabContextAndWriter(label, activeWorkingFileId);
  }

  if (memoryHandle) {
    // Never disable CAS merely because lastKnown is 0 — writeWorkingFileJson reads disk + content fence.
    return writeWorkingFileJson(json, memoryHandle, {
      skipCas: options?.skipCas,
      expectedLastModified:
        options?.skipCas || lastKnownFileModified <= 0 ? undefined : lastKnownFileModified,
    });
  }
  if (!mobileWorkingFileName) return { ok: false, reason: "no_handle" };
  try {
    const existing = await idbGetMobileCopy(activeWorkingFileId, mobileWorkingFileName);
    const diskJson = existing?.json ?? "";
    const fence = assertSafeWorkingFileWrite({
      outgoingJson: json,
      diskJson,
      expectedContentHash: options?.skipCas ? undefined : lastSyncedContentHash,
      skipCas: options?.skipCas,
      requireDiskBaseline: !options?.skipCas && Boolean(existing),
    });
    if (!fence.ok) {
      return {
        ok: false,
        reason: fence.reason,
        message: fence.message,
        diskJson,
      };
    }
    if (!options?.skipCas && lastKnownFileModified > 0 && existing) {
      if (
        existing.sourceLastModified > 0 &&
        existing.sourceLastModified !== lastKnownFileModified
      ) {
        return { ok: false, reason: "conflict", diskJson, message: "Mobile-Kopie wurde extern geändert." };
      }
    }
    const sourceLastModified = Date.now();
    await rememberMobileCopy(json, mobileWorkingFileName, sourceLastModified);
    noteOwnWriteToWorkingFile(json, sourceLastModified);
    return { ok: true, lastModified: sourceLastModified };
  } catch {
    return { ok: false, reason: "io_error" };
  }
}

export async function createAndAttachWorkingFile(
  initialJson: string,
  suggestedName: string = STANDARD_WORKING_FILENAME,
): Promise<FileSystemFileHandle | null> {
  const handle = await attachWorkingFileCreate(suggestedName);
  if (!handle) return null;
  const result = await writeWorkingFileJson(initialJson, handle, { skipCas: true });
  if (!result.ok) {
    await detachWorkingFile();
    endWorkingFileSwitch();
    return null;
  }
  setWorkingFilePersistPaused(false);
  endWorkingFileSwitch();
  markWorkingFileSessionHydrated();
  // After write: sync state is clean — refresh listeners (dirty/label).
  notifyWorkingFileAttached();
  return handle;
}

/**
 * Speichern unter… — current board JSON to a newly picked path; that file becomes the
 * Arbeitsdatei (auto-sync target for subsequent Speichern / Hintergrund-Sync).
 */
export async function saveWorkingFileAs(
  json: string,
  suggestedName?: string | null,
): Promise<FileSystemFileHandle | null> {
  if (!isWorkingFileSupported() || typeof window.showSaveFilePicker !== "function") {
    return null;
  }
  const name =
    suggestedName?.trim() ||
    getWorkingFileLabel() ||
    STANDARD_WORKING_FILENAME;
  return createAndAttachWorkingFile(json, name);
}

/** Fired when a file handle becomes the live Arbeitsdatei / sync target. */
export const WORKING_FILE_ATTACHED_EVENT = "t2-working-file-attached";
/** Fired when the Arbeitsdatei is detached (Neu ohne Datei, etc.). */
export const WORKING_FILE_DETACHED_EVENT = "t2-working-file-detached";

export function notifyWorkingFileAttached(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(WORKING_FILE_ATTACHED_EVENT));
}

export function notifyWorkingFileDetached(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(WORKING_FILE_DETACHED_EVENT));
}

export async function restoreWorkingFileFromDisk(
  preferredFileName?: string | null,
  preferredWf?: string | null,
): Promise<FileSystemFileHandle | null> {
  // Never silently attach another tab's last file from shared localStorage alone.
  if (
    !preferredFileName?.trim() &&
    !preferredWf?.trim() &&
    !mayAutoRestoreWorkingFileFromStorage()
  ) {
    return null;
  }

  const preferredName =
    preferredFileName?.trim() || resolvePreferredWorkingFileName();
  const preferredId =
    preferredWf?.trim() || resolvePreferredWorkingFileId();

  if (!preferredName && !preferredId) {
    return null;
  }

  const persisted = await idbGetMobileCopy(preferredId, preferredName);
  if (persisted?.fileName?.trim()) {
    const persistedWf = persisted.wf?.trim() || preferredId;
    if (
      !preferredId ||
      (persistedWf && persistedWf === preferredId) ||
      (!preferredId &&
        (!preferredName ||
          normalizeWorkingFilename(persisted.fileName) ===
            normalizeWorkingFilename(preferredName)))
    ) {
      mobileWorkingFileName = persisted.fileName.trim();
      if (persistedWf) activeWorkingFileId = persistedWf;
      rememberLastFileNameInStorage(mobileWorkingFileName);
      syncTabContextAndWriter(mobileWorkingFileName, activeWorkingFileId);
      if (persisted.json?.trim()) {
        lastSyncedBoardJson = persisted.json;
        lastKnownFileModified = persisted.sourceLastModified;
      }
    }
  }

  if (!isWorkingFileSupported()) {
    if (mobileWorkingFileName) syncTabContextAndWriter(mobileWorkingFileName, activeWorkingFileId);
    return null;
  }

  const handle = await idbGetHandle(preferredId, preferredName, { allowNameIndex: false });
  if (!handle) {
    if (mobileWorkingFileName) syncTabContextAndWriter(mobileWorkingFileName, activeWorkingFileId);
    return null;
  }

  const handleName = handle.name?.trim() || STANDARD_WORKING_FILENAME;
  if (
    preferredName &&
    !preferredId &&
    normalizeWorkingFilename(handleName) !== normalizeWorkingFilename(preferredName)
  ) {
    if (mobileWorkingFileName) syncTabContextAndWriter(mobileWorkingFileName, activeWorkingFileId);
    return null;
  }

  const wf =
    preferredId ||
    activeWorkingFileId ||
    (await resolveWfForHandle(handle));

  try {
    let granted = (await handle.queryPermission({ mode: "readwrite" })) === "granted";
    if (!granted) granted = (await handle.requestPermission({ mode: "readwrite" })) === "granted";
    if (granted) {
      memoryHandle = handle;
      activeWorkingFileId = wf;
      rememberLastFileNameInStorage(handleName);
      syncTabContextAndWriter(handleName, wf);
      try {
        await idbPutHandle(handle, handleName, wf);
      } catch {
        /* ignore */
      }
      return handle;
    }
  } catch {
    /* ignore */
  }

  if (handleName) {
    mobileWorkingFileName = handleName;
    activeWorkingFileId = wf;
    rememberLastFileNameInStorage(handleName);
    syncTabContextAndWriter(handleName, wf);
  }
  memoryHandle = null;
  return null;
}

/**
 * Rename the attached Arbeitsdatei in place (Chromium `FileSystemFileHandle.move`).
 * Falls back to null when unsupported — caller should offer Speichern unter….
 */
export async function renameWorkingFile(
  newNameRaw: string,
): Promise<{ ok: true; name: string } | { ok: false; reason: string }> {
  const handle = memoryHandle;
  if (!handle) {
    return { ok: false, reason: "Keine Arbeitsdatei verknüpft." };
  }
  if (typeof handle.move !== "function") {
    return {
      ok: false,
      reason: "Umbenennen wird in diesem Browser nicht unterstützt. Nutze Speichern unter…",
    };
  }
  const next = suggestedWorkingFileName(newNameRaw.trim() || handle.name);
  if (next === (handle.name?.trim() || "")) {
    return { ok: true, name: next };
  }
  try {
    if (!(await ensureReadWritePermission(handle))) {
      return { ok: false, reason: "Keine Schreibberechtigung für die Datei." };
    }
    const oldName = handle.name?.trim() || STANDARD_WORKING_FILENAME;
    await handle.move(next);
    const fileName = handle.name?.trim() || next;
    rememberLastFileNameInStorage(fileName);
    syncTabContextAndWriter(fileName, activeWorkingFileId);
    try {
      if (activeWorkingFileId) {
        await idbPutHandle(handle, fileName, activeWorkingFileId);
        await rememberRecentWorkingFile(handle, activeWorkingFileId);
      }
      if (oldName !== fileName) {
        await idbDelete(nameIndexIdbKey(oldName));
      }
    } catch {
      /* ignore index errors */
    }
    notifyWorkingFileAttached();
    return { ok: true, name: fileName };
  } catch (e) {
    console.error("Arbeitsdatei umbenennen:", e);
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "Umbenennen fehlgeschlagen.",
    };
  }
}

export async function detachWorkingFile(): Promise<void> {
  const name =
    memoryHandle?.name?.trim() ||
    mobileWorkingFileName?.trim() ||
    getRememberedWorkingFileName();
  const wf = activeWorkingFileId;
  memoryHandle = null;
  mobileWorkingFileName = null;
  activeWorkingFileId = null;
  workingFileSwitchInProgress = false;
  clearWorkingFileSyncState();
  clearWorkingFileSessionHydrated();
  setWorkingFilePersistPaused(false);
  clearRememberedFileNameInStorage();
  syncTabContextAndWriter(null, null);
  try {
    await idbClearHandle(wf, name);
    await idbClearMobileCopy(wf, name);
  } catch {
    /* ignore */
  }
  notifyWorkingFileDetached();
}

export function workingFileDisplayName(handle: FileSystemFileHandle | null): string | null {
  if (!handle) return null;
  return handle.name?.trim() || "Arbeitsdatei";
}

export async function attachWorkingFileFromPicker(): Promise<{
  handle: FileSystemFileHandle;
  hydrate: HydrateWorkingFileResult;
} | null> {
  const handle = await attachWorkingFileOpen();
  if (!handle) return null;
  return { handle, hydrate: await hydrateStoreFromWorkingFile(handle) };
}
