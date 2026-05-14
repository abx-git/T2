/**
 * Standard-Speicherdatei (File System Access API): ein gewähltes JSON-File-Handle in IndexedDB.
 * Lesen beim Start; Schreiben nur über den Speichern-Button (wählt bei Bedarf die Datei und schreibt).
 */

/** Vorgeschlagener Dateiname für Board-Backups (JSON); frei änderbar beim Speichern. */
export const STANDARD_BOARD_BACKUP_FILENAME = "hierarchical-task-manager-backup.json";

const IDB_NAME = "hierarchical-task-manager-live-backup";
const IDB_VERSION = 1;
const IDB_STORE = "handles";
const IDB_KEY = "board-json";

let memoryHandle: FileSystemFileHandle | null = null;

/** Zuletzt erfolgreich in die Speicherdatei geschriebener Board-JSON-Text (Vergleich für „ungesichert“). */
let lastPersistedBoardJson: string | null = null;

export function markPersistedBoardJson(json: string): void {
  lastPersistedBoardJson = json;
}

export function clearPersistedBoardJson(): void {
  lastPersistedBoardJson = null;
}

/** `true`, wenn eine Speicherdatei aktiv ist und der aktuelle Export sich vom letzten erfolgreichen Schreiben unterscheidet. */
export function isPersistedBoardJsonDirty(currentJson: string): boolean {
  if (!memoryHandle) return false;
  return lastPersistedBoardJson !== currentJson;
}

export function isLiveBackupSupported(): boolean {
  return typeof window !== "undefined" && typeof window.showSaveFilePicker === "function";
}

/** Brave meldet sich oft mit „Brave“ in der User-Agent-Zeichenkette. */
export function isUserAgentLikelyBrave(): boolean {
  return typeof navigator !== "undefined" && /\bBrave\b/i.test(navigator.userAgent);
}

/** Kurzer Tooltip, wenn die File-System-API fehlt. */
export function fileSystemAccessUnavailableTooltip(): string {
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return "Dauerhaft speichern: Seite über https:// oder http://localhost öffnen (unsicheres http kann die Datei-API deaktivieren).";
  }
  if (isUserAgentLikelyBrave()) {
    return "Brave: Adresszeile brave://flags/#file-system-access-api öffnen, „File System Access API“ auf Enabled, Brave neu starten.";
  }
  return "Dauerhaft in dieselbe Datei: Chrome, Edge oder Brave (mit File-System-API). Sonst „Export“ (Download) nutzen.";
}

/** Ausführliche Meldung für window.alert, wenn Speichern mit Datei-Handle nicht möglich ist. */
export function fileSystemAccessUnavailableMessage(): string {
  const lines: string[] = [];

  if (typeof window !== "undefined" && window.isSecureContext === false) {
    lines.push(
      "Die Seite läuft nicht in einem sicheren Kontext (üblich: nur http:// mit anderer Adresse als localhost). Die Datei-API („Speichern unter“) steht dann oft nicht zur Verfügung — bitte https:// verwenden oder lokal über http://localhost öffnen.",
    );
  }

  if (isUserAgentLikelyBrave()) {
    lines.push(
      "Brave ist zwar Chromium-basiert, schaltet die File-System-API aber standardmäßig ab. In der Adresszeile „brave://flags/#file-system-access-api“ öffnen, den Eintrag „File System Access API“ auf „Enabled“ stellen und Brave neu starten. Danach funktioniert „Speichern“ hier wie in Chrome.",
    );
  } else {
    lines.push(
      "Dauerhaftes Speichern in dieselbe Datei nutzt die File-System-API („Speichern unter“). Sie fehlt in diesem Browser oder ist deaktiviert. Bitte Chrome oder Microsoft Edge verwenden — oder Brave mit aktivierter File-System-API (brave://flags/#file-system-access-api).",
    );
  }

  lines.push("In Safari und Firefox ist diese API nicht verfügbar; dort bitte den Download-Button („Export“) nutzen.");

  return lines.join("\n\n");
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

export function getLiveBackupHandle(): FileSystemFileHandle | null {
  return memoryHandle;
}

export async function pickLiveBackupTarget(): Promise<FileSystemFileHandle | null> {
  if (!isLiveBackupSupported() || !window.showSaveFilePicker) return null;
  const handle = await window.showSaveFilePicker({
    suggestedName: STANDARD_BOARD_BACKUP_FILENAME,
    types: [
      {
        description: "JSON",
        accept: { "application/json": [".json"] },
      },
    ],
  });
  memoryHandle = handle;
  try {
    await idbPutHandle(handle);
  } catch {
    /* IndexedDB z. B. im privaten Modus — Backup läuft nur für diese Sitzung im RAM. */
  }
  return handle;
}

/** Nach Seitenaufruf: Handle aus IndexedDB laden und Schreibberechtigung anfragen. */
export async function restoreLiveBackupTargetFromDisk(): Promise<FileSystemFileHandle | null> {
  if (!isLiveBackupSupported()) return null;
  const handle = await idbGetHandle();
  if (!handle) return null;
  try {
    let ok = (await handle.queryPermission({ mode: "readwrite" })) === "granted";
    if (!ok) ok = (await handle.requestPermission({ mode: "readwrite" })) === "granted";
    if (!ok) return null;
    memoryHandle = handle;
    return handle;
  } catch {
    return null;
  }
}

export async function disableLiveBackup(): Promise<void> {
  memoryHandle = null;
  clearPersistedBoardJson();
  try {
    await idbClearHandle();
  } catch {
    /* ignore */
  }
}

export async function writeFullJsonToHandle(handle: FileSystemFileHandle, json: string): Promise<void> {
  const writable = await handle.createWritable({ keepExistingData: false });
  await writable.write(json);
  await writable.close();
}

/** Liest den aktuellen Dateiinhalt (z. B. Start-Hydration aus dem Backup). */
export async function readFullJsonFromHandle(handle: FileSystemFileHandle): Promise<string | null> {
  try {
    const file = await handle.getFile();
    return await file.text();
  } catch (e) {
    console.error("Live-Backup lesen:", e);
    return null;
  }
}

/** Schreibt in die aktuell aktive Backup-Datei (null wenn kein Ziel oder keine Berechtigung). */
export async function flushLiveBackupJson(json: string): Promise<boolean> {
  const handle = memoryHandle;
  if (!handle) return false;
  try {
    let ok = (await handle.queryPermission({ mode: "readwrite" })) === "granted";
    if (!ok) ok = (await handle.requestPermission({ mode: "readwrite" })) === "granted";
    if (!ok) return false;
    await writeFullJsonToHandle(handle, json);
    return true;
  } catch (e) {
    console.error("Live-Backup:", e);
    return false;
  }
}
