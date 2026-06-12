/**
 * Verknüpfte Arbeitsdatei (File System Access API): ein JSON-File-Handle in IndexedDB.
 * Attach lädt die Datei; Auto-Save und externes Ändern werden in `WorkingFileSync` gesteuert.
 */

import {
  boardSnapshotToReplacePayload,
  isBoardSnapshot,
  parseExportedDocument,
} from "@/lib/task-tree-json";
import { useTaskTreeStore } from "@/store/task-tree-store";

/** Vorgeschlagener Dateiname beim Anlegen einer neuen Arbeitsdatei. */
export const STANDARD_WORKING_FILENAME = "t2-board.json";

const IDB_NAME = "t2-working-file";
const IDB_VERSION = 1;
const IDB_STORE = "handles";
const IDB_KEY = "board-json";

let memoryHandle: FileSystemFileHandle | null = null;

/** Zuletzt mit der Datei abgeglichener Board-JSON-Text. */
let lastSyncedBoardJson: string | null = null;

/** `File.lastModified` nach letztem erfolgreichen Lesen/Schreiben. */
let lastKnownFileModified = 0;

/** Kurz nach eigenem Schreiben externes Polling unterdrücken (ms seit Epoch). */
let suppressExternalPollUntil = 0;

const EXTERNAL_POLL_SUPPRESS_MS = 1500;

export function isWorkingFileSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.showOpenFilePicker === "function" &&
    typeof window.showSaveFilePicker === "function"
  );
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
  return memoryHandle !== null;
}

export function markWorkingFileSynced(json: string, fileLastModified: number): void {
  lastSyncedBoardJson = json;
  lastKnownFileModified = fileLastModified;
  suppressExternalPollUntil = Date.now() + EXTERNAL_POLL_SUPPRESS_MS;
}

export function clearWorkingFileSyncState(): void {
  lastSyncedBoardJson = null;
  lastKnownFileModified = 0;
  suppressExternalPollUntil = 0;
}

export function isWorkingFileDirty(currentJson: string): boolean {
  if (!memoryHandle) return false;
  return lastSyncedBoardJson !== currentJson;
}

export function shouldSuppressExternalFilePoll(): boolean {
  return Date.now() < suppressExternalPollUntil;
}

export function getLastKnownFileModified(): number {
  return lastKnownFileModified;
}

export function getLastSyncedBoardJson(): string | null {
  return lastSyncedBoardJson;
}

/** Externe Änderung zur Kenntnis genommen, ohne lokalen Stand zu überschreiben. */
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

async function idbPutHandle(handle: FileSystemFileHandle): Promise<void> {
  const db = await openIdb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("tx"));
      tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
    });
  } finally {
    db.close();
  }
}

async function idbGetHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const db = await openIdb();
    try {
      return await new Promise<FileSystemFileHandle | null>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        tx.onerror = () => reject(tx.error ?? new Error("tx"));
        const r = tx.objectStore(IDB_STORE).get(IDB_KEY);
        r.onsuccess = () => resolve((r.result as FileSystemFileHandle | undefined) ?? null);
      });
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

async function idbClearHandle(): Promise<void> {
  try {
    const db = await openIdb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("tx"));
        tx.objectStore(IDB_STORE).delete(IDB_KEY);
      });
    } finally {
      db.close();
    }
  } catch {
    /* ignore */
  }
}

async function ensureReadWritePermission(handle: FileSystemFileHandle): Promise<boolean> {
  let ok = (await handle.queryPermission({ mode: "readwrite" })) === "granted";
  if (!ok) ok = (await handle.requestPermission({ mode: "readwrite" })) === "granted";
  return ok;
}

const JSON_PICKER_TYPES: FilePickerAcceptType[] = [
  {
    description: "JSON",
    accept: { "application/json": [".json"] },
  },
];

export async function readWorkingFileSnapshot(
  handle: FileSystemFileHandle = memoryHandle!,
): Promise<{ text: string; lastModified: number } | null> {
  if (!handle) return null;
  try {
    const file = await handle.getFile();
    const text = await file.text();
    return { text, lastModified: file.lastModified };
  } catch (e) {
    console.error("Arbeitsdatei lesen:", e);
    return null;
  }
}

export async function writeWorkingFileJson(json: string, handle: FileSystemFileHandle = memoryHandle!): Promise<boolean> {
  if (!handle) return false;
  try {
    if (!(await ensureReadWritePermission(handle))) return false;
    const writable = await handle.createWritable({ keepExistingData: false });
    await writable.write(json);
    await writable.close();
    const file = await handle.getFile();
    markWorkingFileSynced(json, file.lastModified);
    return true;
  } catch (e) {
    console.error("Arbeitsdatei schreiben:", e);
    return false;
  }
}

function loadBoardFromJsonText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  try {
    const doc = parseExportedDocument(trimmed);
    if (!isBoardSnapshot(doc)) return false;
    useTaskTreeStore.getState().replaceBoardFromImport(boardSnapshotToReplacePayload(doc));
    return true;
  } catch {
    return false;
  }
}

async function rememberHandle(handle: FileSystemFileHandle): Promise<void> {
  memoryHandle = handle;
  try {
    await idbPutHandle(handle);
  } catch {
    /* IndexedDB z. B. privat — nur Sitzung im RAM */
  }
}

/** Bestehende JSON-Datei als Arbeitsdatei verknüpfen. */
export async function attachWorkingFileOpen(): Promise<FileSystemFileHandle | null> {
  if (!isWorkingFileSupported() || !window.showOpenFilePicker) return null;
  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: JSON_PICKER_TYPES,
    });
    await rememberHandle(handle);
    return handle;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return null;
    throw e;
  }
}

/** Neue JSON-Arbeitsdatei anlegen und verknüpfen. */
export async function attachWorkingFileCreate(): Promise<FileSystemFileHandle | null> {
  if (!isWorkingFileSupported() || !window.showSaveFilePicker) return null;
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: STANDARD_WORKING_FILENAME,
      types: JSON_PICKER_TYPES,
    });
    await rememberHandle(handle);
    return handle;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return null;
    throw e;
  }
}

/** Nach Handle-Wahl: Inhalt laden und Sync-Zustand setzen. */
export async function hydrateStoreFromWorkingFile(handle: FileSystemFileHandle): Promise<void> {
  const snap = await readWorkingFileSnapshot(handle);
  if (snap?.text.trim()) {
    loadBoardFromJsonText(snap.text);
    markWorkingFileSynced(snap.text, snap.lastModified);
    return;
  }
  const emptyJson = ""; // caller should pass current export after attach if new file
  const file = await handle.getFile();
  markWorkingFileSynced(emptyJson, file.lastModified);
}

export async function attachWorkingFileFromPicker(): Promise<FileSystemFileHandle | null> {
  const handle = await attachWorkingFileOpen();
  if (!handle) return null;
  await hydrateStoreFromWorkingFile(handle);
  return handle;
}

export async function createAndAttachWorkingFile(initialJson: string): Promise<FileSystemFileHandle | null> {
  const handle = await attachWorkingFileCreate();
  if (!handle) return null;
  const ok = await writeWorkingFileJson(initialJson, handle);
  if (!ok) {
    await detachWorkingFile();
    return null;
  }
  return handle;
}

export async function restoreWorkingFileFromDisk(): Promise<FileSystemFileHandle | null> {
  if (!isWorkingFileSupported()) return null;
  const handle = await idbGetHandle();
  if (!handle) return null;
  try {
    if (!(await ensureReadWritePermission(handle))) return null;
    memoryHandle = handle;
    return handle;
  } catch {
    return null;
  }
}

export async function detachWorkingFile(): Promise<void> {
  memoryHandle = null;
  clearWorkingFileSyncState();
  try {
    await idbClearHandle();
  } catch {
    /* ignore */
  }
}

export function workingFileDisplayName(handle: FileSystemFileHandle | null): string | null {
  if (!handle) return null;
  const n = handle.name?.trim();
  return n || "Arbeitsdatei";
}
