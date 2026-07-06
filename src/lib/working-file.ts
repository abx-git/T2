/**
 * Arbeitsdatei (File System Access API): einziges Speichermedium.
 * Das File-Handle wird in IndexedDB gehalten, damit die Datei beim nächsten Start automatisch
 * wieder geöffnet werden kann — Board-Daten liegen nur in der JSON-Datei.
 */

import {
  applyBoardJsonToStore,
  boardJsonFromStoreState,
  boardStatesEquivalent,
  planFileReconcile,
} from "@/lib/file-board-reconcile";
import { boardImportPayloadFromExportText } from "@/lib/task-tree-json";

/** Vorgeschlagener Dateiname beim Anlegen einer neuen Arbeitsdatei. */
export const STANDARD_WORKING_FILENAME = "t2-board.json";

const IDB_NAME = "t2-working-file";
const IDB_VERSION = 1;
const IDB_STORE = "handles";
const IDB_KEY = "board-json";
const IDB_MOBILE_COPY_KEY = "mobile-working-copy";
const LS_LAST_FILE_NAME = "t2-last-working-file-name";

let memoryHandle: FileSystemFileHandle | null = null;
let mobileWorkingFileName: string | null = null;

interface MobileWorkingCopyRecord {
  fileName: string;
  json: string;
  sourceLastModified: number;
}

/** Zuletzt mit der Datei abgeglichener Board-JSON-Text. */
let lastSyncedBoardJson: string | null = null;

/** `File.lastModified` nach letztem erfolgreichen Lesen/Schreiben. */
let lastKnownFileModified = 0;

/** Kurz nach eigenem Schreiben externes Polling unterdrücken (ms seit Epoch). */
let suppressExternalPollUntil = 0;

/** Einmaliges Laden der Arbeitsdatei pro Browser-Tab (verhindert Re-Hydrate bei Re-Renders). */
let sessionHydrated = false;

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

export type WriteWorkingFileResult =
  | { ok: true; lastModified: number }
  | { ok: false; reason: "no_handle" | "permission_denied" | "conflict" | "io_error" };

export function isWorkingFileSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.showOpenFilePicker === "function" &&
    typeof window.showSaveFilePicker === "function"
  );
}

/** Smartphone/Tablet: klassischer Datei-Dialog statt File-System-API. */
export function isMobileWorkingFileEnvironment(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function prefersBrowserFilePicker(): boolean {
  return isMobileWorkingFileEnvironment();
}

/** Arbeitsdatei-UI (Öffnen/Speichern) — Desktop-API oder mobiler Datei-Dialog. */
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

export function markWorkingFileSynced(json: string, fileLastModified: number): void {
  lastSyncedBoardJson = json;
  lastKnownFileModified = fileLastModified;
}

/** Nach eigenem Schreiben: Sync-Stand setzen und kurz externe Prüfung aussetzen. */
export function noteOwnWriteToWorkingFile(json: string, fileLastModified: number): void {
  markWorkingFileSynced(json, fileLastModified);
  suppressExternalPollUntil = Date.now() + OWN_WRITE_SUPPRESS_MS;
  void persistBrowserMirror(json, fileLastModified);
}

export function clearWorkingFileSyncState(): void {
  lastSyncedBoardJson = null;
  lastKnownFileModified = 0;
  suppressExternalPollUntil = 0;
}

export function isWorkingFileDirty(currentJson?: string): boolean {
  if (!isWorkingFileAttached()) return false;
  const json = currentJson ?? boardJsonFromStoreState();
  const synced = getLastSyncedBoardJson();
  if (!synced) return json.trim().length > 0;
  return !boardStatesEquivalent(json, synced);
}

export function getWorkingFileLabel(): string | null {
  if (memoryHandle) return workingFileDisplayName(memoryHandle);
  if (mobileWorkingFileName?.trim()) return mobileWorkingFileName.trim();
  return getRememberedWorkingFileName();
}

/** Zuletzt verwendeter Dateiname (localStorage, über Browser-Neustarts). */
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
    /* privat / voll */
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

/** Datei auf der Platte seit letztem Abgleich unverändert (gleicher Zeitstempel). */
export function isKnownFileRevision(fileLastModified: number): boolean {
  return fileLastModified > 0 && fileLastModified === lastKnownFileModified;
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

async function idbPutMobileCopy(record: MobileWorkingCopyRecord): Promise<void> {
  const db = await openIdb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("tx"));
      tx.objectStore(IDB_STORE).put(record, IDB_MOBILE_COPY_KEY);
    });
  } finally {
    db.close();
  }
}

async function idbGetMobileCopy(): Promise<MobileWorkingCopyRecord | null> {
  try {
    const db = await openIdb();
    try {
      return await new Promise<MobileWorkingCopyRecord | null>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        tx.onerror = () => reject(tx.error ?? new Error("tx"));
        const r = tx.objectStore(IDB_STORE).get(IDB_MOBILE_COPY_KEY);
        r.onsuccess = () => resolve((r.result as MobileWorkingCopyRecord | undefined) ?? null);
      });
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

async function idbClearMobileCopy(): Promise<void> {
  try {
    const db = await openIdb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("tx"));
        tx.objectStore(IDB_STORE).delete(IDB_MOBILE_COPY_KEY);
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

export async function writeWorkingFileJson(
  json: string,
  handle: FileSystemFileHandle = memoryHandle!,
  options?: { expectedLastModified?: number },
): Promise<WriteWorkingFileResult> {
  if (!handle) return { ok: false, reason: "no_handle" };
  try {
    if (!(await ensureReadWritePermission(handle))) {
      return { ok: false, reason: "permission_denied" };
    }
    const before = await handle.getFile();
    if (
      options?.expectedLastModified !== undefined &&
      before.lastModified !== options.expectedLastModified
    ) {
      return { ok: false, reason: "conflict" };
    }
    const writable = await handle.createWritable({ keepExistingData: false });
    await writable.write(json);
    await writable.close();
    const file = await handle.getFile();
    noteOwnWriteToWorkingFile(json, file.lastModified);
    return { ok: true, lastModified: file.lastModified };
  } catch (e) {
    console.error("Arbeitsdatei schreiben:", e);
    return { ok: false, reason: "io_error" };
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

async function rememberMobileCopy(json: string, fileName: string, sourceLastModified: number): Promise<void> {
  const trimmedName = fileName.trim() || STANDARD_WORKING_FILENAME;
  mobileWorkingFileName = trimmedName;
  rememberLastFileNameInStorage(trimmedName);
  try {
    await idbPutMobileCopy({ fileName: trimmedName, json, sourceLastModified });
  } catch {
    /* IndexedDB z. B. privat */
  }
}

export async function bindMobileWorkingFile(file: File, json?: string): Promise<void> {
  const fileName = file.name?.trim() || STANDARD_WORKING_FILENAME;
  const payload = json ?? boardJsonFromStoreState();
  memoryHandle = null;
  await idbClearHandle();
  await rememberMobileCopy(payload, fileName, file.lastModified);
  markWorkingFileSynced(payload, file.lastModified);
  markWorkingFileSessionHydrated();
}

async function clearMobileWorkingFile(): Promise<void> {
  mobileWorkingFileName = null;
  try {
    await idbClearMobileCopy();
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
  if (trimmed.charCodeAt(0) === 0xfeff) {
    return trimmed.slice(1);
  }
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

async function attachWorkingFileFromText(
  text: string,
  fileName: string,
  fileLastModified: number,
): Promise<BrowserFileAttachResult> {
  memoryHandle = null;
  await idbClearHandle();

  if (text.trim() && !boardImportPayloadFromExportText(text)) {
    return {
      status: "read_error",
      message:
        "Die Datei ist keine gültige T2-Arbeitsdatei (JSON-Format „hierarchical-task-manager“ erwartet).",
    };
  }

  const result = hydrateFromFileText(text, fileLastModified);
  if (result.status === "conflict") {
    return result;
  }

  const syncedJson = getLastSyncedBoardJson() ?? text;
  await rememberMobileCopy(syncedJson, fileName, fileLastModified);
  markWorkingFileSessionHydrated();
  return result;
}

async function rememberHandle(handle: FileSystemFileHandle): Promise<void> {
  memoryHandle = handle;
  const fileName = handle.name?.trim() || STANDARD_WORKING_FILENAME;
  rememberLastFileNameInStorage(fileName);
  try {
    await idbPutHandle(handle);
  } catch {
    /* IndexedDB z. B. privat — nur Sitzung im RAM */
  }
  const existing = await idbGetMobileCopy();
  if (existing?.json?.trim()) {
    await rememberMobileCopy(existing.json, fileName, existing.sourceLastModified);
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
export async function hydrateStoreFromWorkingFile(handle: FileSystemFileHandle): Promise<HydrateWorkingFileResult> {
  const snap = await readWorkingFileSnapshot(handle);
  if (!snap) return { status: "empty" };

  const result = hydrateFromFileText(snap.text, snap.lastModified);
  if (result.status !== "conflict") {
    markWorkingFileSessionHydrated();
    const syncedJson = getLastSyncedBoardJson() ?? snap.text;
    const fileName = handle.name?.trim() || STANDARD_WORKING_FILENAME;
    await rememberMobileCopy(syncedJson, fileName, snap.lastModified);
  }
  return result;
}

/**
 * Smartphone/Cloud-Sync: JSON über den normalen Datei-Dialog öffnen
 * (z. B. Proton Drive, Dateien-App).
 */
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

/** Arbeitsdatei aus eingefügtem JSON (Fallback ohne Dateizugriff). */
export async function attachWorkingFileFromPastedText(
  rawText: string,
  fileName: string = STANDARD_WORKING_FILENAME,
): Promise<BrowserFileAttachResult> {
  try {
    const text = normalizeImportedFileText(rawText);
    return await attachWorkingFileFromText(text, fileName, Date.now());
  } catch (e) {
    console.error("Arbeitsdatei aus Text:", e);
    return {
      status: "read_error",
      message: userFacingFileReadError(e),
    };
  }
}

/** Schreibt in verknüpfte Datei (Desktop) oder mobile Zwischenkopie. */
export async function persistWorkingFileJson(json: string): Promise<WriteWorkingFileResult> {
  if (memoryHandle) {
    return writeWorkingFileJson(json);
  }
  if (!mobileWorkingFileName) {
    return { ok: false, reason: "no_handle" };
  }
  try {
    const sourceLastModified = lastKnownFileModified || Date.now();
    await rememberMobileCopy(json, mobileWorkingFileName, sourceLastModified);
    noteOwnWriteToWorkingFile(json, sourceLastModified);
    return { ok: true, lastModified: sourceLastModified };
  } catch (e) {
    console.error("Mobile Arbeitsdatei speichern:", e);
    return { ok: false, reason: "io_error" };
  }
}

export async function attachWorkingFileFromPicker(): Promise<{
  handle: FileSystemFileHandle;
  hydrate: HydrateWorkingFileResult;
} | null> {
  const handle = await attachWorkingFileOpen();
  if (!handle) return null;
  const hydrate = await hydrateStoreFromWorkingFile(handle);
  return { handle, hydrate };
}

export async function createAndAttachWorkingFile(initialJson: string): Promise<FileSystemFileHandle | null> {
  const handle = await attachWorkingFileCreate();
  if (!handle) return null;
  const result = await writeWorkingFileJson(initialJson, handle);
  if (!result.ok) {
    await detachWorkingFile();
    return null;
  }
  markWorkingFileSessionHydrated();
  return handle;
}

export async function restoreWorkingFileFromDisk(): Promise<FileSystemFileHandle | null> {
  const persisted = await idbGetMobileCopy();
  if (persisted?.fileName?.trim()) {
    mobileWorkingFileName = persisted.fileName.trim();
    rememberLastFileNameInStorage(mobileWorkingFileName);
    if (persisted.json?.trim()) {
      lastSyncedBoardJson = persisted.json;
      lastKnownFileModified = persisted.sourceLastModified;
    }
  }

  if (!isWorkingFileSupported()) {
    return null;
  }

  const handle = await idbGetHandle();
  if (!handle) return null;

  try {
    let granted = (await handle.queryPermission({ mode: "readwrite" })) === "granted";
    if (!granted) {
      granted = (await handle.requestPermission({ mode: "readwrite" })) === "granted";
    }
    if (granted) {
      memoryHandle = handle;
      const fileName = handle.name?.trim() || mobileWorkingFileName || STANDARD_WORKING_FILENAME;
      rememberLastFileNameInStorage(fileName);
      return handle;
    }
  } catch {
    /* Spiegelkopie / Dateiname bleiben erhalten */
  }

  const nameFromHandle = handle.name?.trim();
  if (nameFromHandle) {
    mobileWorkingFileName = nameFromHandle;
    rememberLastFileNameInStorage(nameFromHandle);
  }
  memoryHandle = null;
  return null;
}

export async function detachWorkingFile(): Promise<void> {
  memoryHandle = null;
  mobileWorkingFileName = null;
  clearWorkingFileSyncState();
  clearWorkingFileSessionHydrated();
  clearRememberedFileNameInStorage();
  try {
    await idbClearHandle();
    await idbClearMobileCopy();
  } catch {
    /* ignore */
  }
}

export function workingFileDisplayName(handle: FileSystemFileHandle | null): string | null {
  if (!handle) return null;
  const n = handle.name?.trim();
  return n || "Arbeitsdatei";
}
