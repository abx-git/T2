"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  FileConflictDialog,
  type FileConflictChoice,
} from "@/components/file-conflict-dialog";
import {
  applyBoardJsonToStore,
  boardJsonFromStoreState,
  boardPersistKeyFromStoreState,
  boardStatesEquivalent,
} from "@/lib/file-board-reconcile";
import {
  downloadWorkingFileSafetyCopy,
  EXTERNAL_WORKING_FILE_POLL_MS,
  getWorkingFileHandle,
  getWorkingFileLabel,
  getActiveWorkingFileId,
  getLastSyncedBoardJson,
  isKnownFileRevision,
  isMobileWorkingFileMode,
  isWorkingFileAttached,
  isWorkingFileDirty,
  isWorkingFileMultiTabUnsafe,
  isWorkingFilePersistPaused,
  isWorkingFileSwitchInProgress,
  markWorkingFileSessionHydrated,
  markWorkingFileSynced,
  peekWorkingFileLastModified,
  persistWorkingFileJson,
  readWorkingFileSnapshot,
  restoreWorkingFileFromDisk,
  shouldSuppressExternalFilePoll,
  wasWorkingFileSessionHydrated,
  WORKING_FILE_ATTACHED_EVENT,
  WORKING_FILE_DETACHED_EVENT,
  WORKING_FILE_PERSIST_PAUSED_EVENT,
  setWorkingFilePersistPaused,
} from "@/lib/working-file";
import { mayAutoRestoreWorkingFileFromStorage } from "@/lib/working-file-safety";
import {
  bindTabWorkingFile,
  getOrCreateTabSessionId,
  resolvePreferredWorkingFileId,
  resolvePreferredWorkingFileName,
} from "@/lib/working-file-tab-context";
import {
  ensureWorkingFileWriter,
  isWorkingFileWriterLeader,
  onWorkingFileWriterRoleChange,
  stopWorkingFileWriter,
} from "@/lib/working-file-writer";
import { useTaskTreeStore } from "@/store/task-tree-store";

function ensureWriterForAttachedFile(): void {
  const wf = getActiveWorkingFileId();
  const label = getWorkingFileLabel();
  if (wf && isWorkingFileAttached()) {
    ensureWorkingFileWriter(wf);
  } else if (label && isWorkingFileAttached()) {
    ensureWorkingFileWriter(label);
  } else {
    stopWorkingFileWriter();
  }
}

export interface WorkingFileSyncProps {
  onWorkingFileNameChange: (fileName: string | null) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSavingChange?: (saving: boolean) => void;
  onNeedsFileSetup?: () => void;
  onPersistPausedChange?: (paused: boolean) => void;
  onMultiTabUnsafeChange?: (unsafe: boolean) => void;
}

/**
 * Autosave with content+mtime CAS.
 * External file edits: poll while visible and adopt disk into the editor.
 * If the editor was dirty, download an editor safety copy first — disk wins.
 */
export function WorkingFileSync({
  onWorkingFileNameChange,
  onDirtyChange,
  onSavingChange,
  onNeedsFileSetup,
  onPersistPausedChange,
  onMultiTabUnsafeChange,
}: WorkingFileSyncProps) {
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictBusy, setConflictBusy] = useState(false);

  const callbacksRef = useRef({
    onWorkingFileNameChange,
    onDirtyChange,
    onSavingChange,
    onNeedsFileSetup,
    onPersistPausedChange,
    onMultiTabUnsafeChange,
  });
  callbacksRef.current = {
    onWorkingFileNameChange,
    onDirtyChange,
    onSavingChange,
    onNeedsFileSetup,
    onPersistPausedChange,
    onMultiTabUnsafeChange,
  };

  const mountedRef = useRef(true);
  const saveQueuedRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const suspendAutoPersistRef = useRef(false);
  const conflictActiveRef = useRef(false);
  const lastPersistKeyRef = useRef<string | null>(null);

  const syncFileLabel = () => {
    callbacksRef.current.onWorkingFileNameChange(getWorkingFileLabel());
  };

  const syncDirty = () => {
    callbacksRef.current.onDirtyChange?.(isWorkingFileDirty());
  };

  const syncPaused = () => {
    callbacksRef.current.onPersistPausedChange?.(isWorkingFilePersistPaused());
  };

  const handleConflictChoice = useCallback(
    async (choice: FileConflictChoice) => {
      if (conflictBusy) return;
      const handle = getWorkingFileHandle();
      if (!handle && !isMobileWorkingFileMode()) return;

      setConflictBusy(true);
      suspendAutoPersistRef.current = true;
      setConflictOpen(false);

      try {
        if (choice === "load_file" && handle) {
          const snap = await readWorkingFileSnapshot(handle);
          if (!snap) return;
          setWorkingFilePersistPaused(false);
          if (snap.text.trim()) {
            const loaded = applyBoardJsonToStore(snap.text);
            if (!loaded) {
              window.alert(
                "Die Arbeitsdatei konnte nicht gelesen werden (ungültiges JSON). Lokaler Stand bleibt erhalten.",
              );
              return;
            }
          }
          markWorkingFileSynced(snap.text, snap.lastModified);
          lastPersistKeyRef.current = boardPersistKeyFromStoreState();
          syncDirty();
          syncPaused();
          return;
        }

        // Keep editor → Speichern unter path: pause + safety download of disk
        if (handle) {
          const snap = await readWorkingFileSnapshot(handle);
          if (snap?.text) downloadWorkingFileSafetyCopy(snap.text, "disk");
        }
        setWorkingFilePersistPaused(true, "external_conflict");
        syncPaused();
        syncDirty();
      } finally {
        conflictActiveRef.current = false;
        suspendAutoPersistRef.current = false;
        setConflictBusy(false);
      }
    },
    [conflictBusy],
  );

  useEffect(() => {
    mountedRef.current = true;
    let storeUnsub: (() => void) | undefined;
    let roleUnsub: (() => void) | undefined;
    let pollId: number | null = null;
    const externalListeners: Array<{ target: EventTarget; type: string; listener: () => void }> =
      [];

    const flushPersist = async (): Promise<boolean> => {
      if (
        !isWorkingFileAttached() ||
        isWorkingFilePersistPaused() ||
        isWorkingFileSwitchInProgress() ||
        !isWorkingFileWriterLeader() ||
        saveInFlightRef.current ||
        conflictActiveRef.current ||
        suspendAutoPersistRef.current
      ) {
        return false;
      }
      if (!isWorkingFileDirty()) {
        syncDirty();
        return true;
      }

      saveInFlightRef.current = true;
      callbacksRef.current.onSavingChange?.(true);
      try {
        const result = await persistWorkingFileJson(boardJsonFromStoreState());
        if (!mountedRef.current) return false;
        if (result.ok) {
          lastPersistKeyRef.current = boardPersistKeyFromStoreState();
          syncDirty();
          return true;
        }
        if (
          result.reason === "conflict" ||
          result.reason === "content_cas_mismatch" ||
          result.reason === "empty_over_nonempty" ||
          result.reason === "unknown_disk_baseline"
        ) {
          const handle = getWorkingFileHandle();
          const snap = handle
            ? await readWorkingFileSnapshot(handle)
            : result.diskJson != null
              ? { text: result.diskJson, lastModified: Date.now() }
              : null;
          if (snap) {
            if (isWorkingFileDirty()) {
              const editorJson = boardJsonFromStoreState();
              if (editorJson.trim() && !boardStatesEquivalent(editorJson, snap.text)) {
                downloadWorkingFileSafetyCopy(editorJson, "editor");
              }
            }
            suspendAutoPersistRef.current = true;
            try {
              if (snap.text.trim()) applyBoardJsonToStore(snap.text);
              markWorkingFileSynced(snap.text, snap.lastModified);
              lastPersistKeyRef.current = boardPersistKeyFromStoreState();
            } finally {
              suspendAutoPersistRef.current = false;
            }
          }
          syncDirty();
          return false;
        }
        syncDirty();
        return false;
      } finally {
        saveInFlightRef.current = false;
        if (mountedRef.current) callbacksRef.current.onSavingChange?.(false);
      }
    };

    const schedulePersistOnChange = () => {
      if (
        !isWorkingFileAttached() ||
        isWorkingFilePersistPaused() ||
        isWorkingFileSwitchInProgress() ||
        !isWorkingFileWriterLeader() ||
        conflictActiveRef.current ||
        suspendAutoPersistRef.current
      ) {
        return;
      }
      if (saveQueuedRef.current) return;
      saveQueuedRef.current = true;
      queueMicrotask(() => {
        saveQueuedRef.current = false;
        void flushPersist();
      });
    };

    const onPersistedBoardChanged = () => {
      if (suspendAutoPersistRef.current) return;
      if (isWorkingFilePersistPaused()) {
        syncDirty();
        return;
      }
      const key = boardPersistKeyFromStoreState();
      if (key === lastPersistKeyRef.current) return;
      lastPersistKeyRef.current = key;
      syncDirty();
      schedulePersistOnChange();
    };

    const applyExternalFileIfNeeded = async () => {
      if (isMobileWorkingFileMode()) return;
      if (
        isWorkingFilePersistPaused() ||
        isWorkingFileSwitchInProgress() ||
        conflictActiveRef.current ||
        suspendAutoPersistRef.current ||
        saveInFlightRef.current ||
        shouldSuppressExternalFilePoll()
      ) {
        return;
      }

      const handle = getWorkingFileHandle();
      if (!handle) return;

      const mtime = await peekWorkingFileLastModified(handle);
      if (mtime == null || !mountedRef.current) return;
      if (isKnownFileRevision(mtime)) return;

      const snap = await readWorkingFileSnapshot(handle);
      if (!snap || !mountedRef.current) return;

      const localJson = boardJsonFromStoreState();
      if (boardStatesEquivalent(snap.text, localJson)) {
        markWorkingFileSynced(snap.text, snap.lastModified);
        syncDirty();
        return;
      }

      if (isWorkingFileDirty()) {
        if (localJson.trim() && !boardStatesEquivalent(localJson, snap.text)) {
          downloadWorkingFileSafetyCopy(localJson, "editor");
        }
      }
      suspendAutoPersistRef.current = true;
      try {
        if (snap.text.trim()) applyBoardJsonToStore(snap.text);
        markWorkingFileSynced(snap.text, snap.lastModified);
        lastPersistKeyRef.current = boardPersistKeyFromStoreState();
      } finally {
        suspendAutoPersistRef.current = false;
      }
      syncDirty();
    };

    const hydrateFromWorkingFileOnce = async (): Promise<void> => {
      if (wasWorkingFileSessionHydrated()) return;

      const handle = getWorkingFileHandle();
      if (handle) {
        const snap = await readWorkingFileSnapshot(handle);
        if (!snap || !mountedRef.current) return;
        markWorkingFileSessionHydrated();

        suspendAutoPersistRef.current = true;
        try {
          if (snap.text.trim()) {
            const loaded = applyBoardJsonToStore(snap.text);
            if (!loaded) {
              console.error("Arbeitsdatei konnte nicht geladen werden — Board-JSON ungültig.");
              window.alert(
                "Die Arbeitsdatei konnte nicht geladen werden. Bitte Backup einspielen oder die Datei prüfen.",
              );
              return;
            }
            markWorkingFileSynced(snap.text, snap.lastModified);
          } else {
            markWorkingFileSynced(boardJsonFromStoreState(), snap.lastModified);
          }
        } finally {
          suspendAutoPersistRef.current = false;
        }
        return;
      }

      if (isMobileWorkingFileMode()) {
        const synced = getLastSyncedBoardJson();
        if (!synced?.trim()) {
          callbacksRef.current.onNeedsFileSetup?.();
          return;
        }
        markWorkingFileSessionHydrated();
        suspendAutoPersistRef.current = true;
        try {
          const loaded = applyBoardJsonToStore(synced);
          if (!loaded) {
            console.error("Gespeichertes Board konnte nicht geladen werden.");
            callbacksRef.current.onNeedsFileSetup?.();
            return;
          }
        } finally {
          suspendAutoPersistRef.current = false;
        }
        return;
      }

      callbacksRef.current.onNeedsFileSetup?.();
    };

    const addExternalListener = (target: EventTarget, type: string, listener: () => void) => {
      target.addEventListener(type, listener);
      externalListeners.push({ target, type, listener });
    };

    void (async () => {
      getOrCreateTabSessionId();
      callbacksRef.current.onMultiTabUnsafeChange?.(isWorkingFileMultiTabUnsafe());
      const preferred = resolvePreferredWorkingFileName();
      const preferredWf = resolvePreferredWorkingFileId();
      if (mayAutoRestoreWorkingFileFromStorage() || preferred || preferredWf) {
        await restoreWorkingFileFromDisk(preferred, preferredWf);
      }
      if (!mountedRef.current) return;
      ensureWriterForAttachedFile();
      await hydrateFromWorkingFileOnce();
      if (!mountedRef.current) return;

      lastPersistKeyRef.current = boardPersistKeyFromStoreState();
      syncFileLabel();
      syncDirty();
      syncPaused();

      storeUnsub = useTaskTreeStore.subscribe(onPersistedBoardChanged);
      roleUnsub = onWorkingFileWriterRoleChange((role) => {
        if (role !== "leader") return;
        void (async () => {
          await applyExternalFileIfNeeded();
          if (conflictActiveRef.current || isWorkingFilePersistPaused()) return;
          void flushPersist();
        })();
      });

      const reflectSlotInUrl = () => {
        const wf = getActiveWorkingFileId();
        if (!wf || !isWorkingFileAttached()) return;
        bindTabWorkingFile(wf, getWorkingFileLabel());
      };
      const runExternalCheck = () => {
        reflectSlotInUrl();
        void applyExternalFileIfNeeded();
      };
      addExternalListener(window, "focus", runExternalCheck);
      addExternalListener(window, "pageshow", runExternalCheck);
      addExternalListener(document, "visibilitychange", () => {
        if (document.visibilityState === "visible") runExternalCheck();
      });

      pollId = window.setInterval(() => {
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
        void applyExternalFileIfNeeded();
      }, EXTERNAL_WORKING_FILE_POLL_MS);

      const onPageHide = () => {
        if (conflictActiveRef.current || isWorkingFilePersistPaused()) return;
        void flushPersist();
      };
      window.addEventListener("pagehide", onPageHide);
      externalListeners.push({ target: window, type: "pagehide", listener: onPageHide });

      const onWorkingFileAttached = () => {
        ensureWriterForAttachedFile();
        lastPersistKeyRef.current = boardPersistKeyFromStoreState();
        syncFileLabel();
        syncDirty();
        syncPaused();
        void applyExternalFileIfNeeded();
      };
      addExternalListener(window, WORKING_FILE_ATTACHED_EVENT, onWorkingFileAttached);
      addExternalListener(window, WORKING_FILE_DETACHED_EVENT, onWorkingFileAttached);
      addExternalListener(window, WORKING_FILE_PERSIST_PAUSED_EVENT, () => {
        syncPaused();
        syncDirty();
        syncFileLabel();
      });
    })();

    return () => {
      mountedRef.current = false;
      if (pollId != null) window.clearInterval(pollId);
      storeUnsub?.();
      roleUnsub?.();
      stopWorkingFileWriter();
      for (const { target, type, listener } of externalListeners) {
        target.removeEventListener(type, listener);
      }
    };
  }, []);

  return (
    <FileConflictDialog
      open={conflictOpen}
      fileName={getWorkingFileLabel()}
      busy={conflictBusy}
      title="Datei wurde extern geändert"
      description="Dein Editor-Stand bleibt erhalten. Du kannst die Datei laden oder den Editor behalten und später unter neuem Namen speichern."
      keepLocalLabel="Editor behalten (Datei-Kopie laden)"
      loadFileLabel="Datei in T2 laden"
      onChoose={(choice) => void handleConflictChoice(choice)}
    />
  );
}
