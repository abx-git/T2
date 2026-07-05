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
  planFileReconcile,
} from "@/lib/file-board-reconcile";
import {
  getLastKnownFileModified,
  getLastSyncedBoardJson,
  getWorkingFileHandle,
  isWorkingFileAttached,
  isWorkingFileDirty,
  markWorkingFileSynced,
  noteExternalFileRevision,
  readWorkingFileSnapshot,
  restoreWorkingFileFromDisk,
  shouldSuppressExternalFilePoll,
  writeWorkingFileJson,
} from "@/lib/working-file";
import { useTaskTreeStore } from "@/store/task-tree-store";

export interface WorkingFileSyncProps {
  onWorkingFileNameChange: (fileName: string | null) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSavingChange?: (saving: boolean) => void;
  onNeedsFileSetup?: () => void;
}

/**
 * Stellt die Arbeitsdatei beim Start wieder her, schreibt bei persistierten Board-Änderungen
 * und fragt bei echten Konflikten einmalig nach (Datei laden vs. lokale Ansicht speichern).
 */
export function WorkingFileSync({
  onWorkingFileNameChange,
  onDirtyChange,
  onSavingChange,
  onNeedsFileSetup,
}: WorkingFileSyncProps) {
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictBusy, setConflictBusy] = useState(false);

  const mountedRef = useRef(true);
  const saveQueuedRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const conflictPendingRef = useRef(false);
  const suspendAutoPersistRef = useRef(false);
  const dismissedConflictRevisionRef = useRef(0);
  const lastPersistKeyRef = useRef<string | null>(null);

  const syncFileLabel = useCallback(() => {
    const h = getWorkingFileHandle();
    const name = h?.name?.trim() ? h.name : h ? "Arbeitsdatei" : null;
    onWorkingFileNameChange(name);
  }, [onWorkingFileNameChange]);

  const syncDirty = useCallback(() => {
    onDirtyChange?.(isWorkingFileDirty(boardJsonFromStoreState()));
  }, [onDirtyChange]);

  useEffect(() => {
    mountedRef.current = true;
    let storeUnsub: (() => void) | undefined;
    const externalListeners: Array<{ target: EventTarget; type: string; listener: () => void }> = [];

    const openConflictDialog = (fileLastModified: number) => {
      if (!mountedRef.current) return;
      if (conflictPendingRef.current) return;
      if (fileLastModified <= dismissedConflictRevisionRef.current) return;
      conflictPendingRef.current = true;
      setConflictOpen(true);
    };

    const flushPersist = async (): Promise<boolean> => {
      if (
        !isWorkingFileAttached() ||
        saveInFlightRef.current ||
        conflictPendingRef.current ||
        suspendAutoPersistRef.current
      ) {
        return false;
      }
      const json = boardJsonFromStoreState();
      if (!isWorkingFileDirty(json)) {
        syncDirty();
        return true;
      }
      saveInFlightRef.current = true;
      onSavingChange?.(true);
      try {
        const result = await writeWorkingFileJson(json, undefined, {
          expectedLastModified: getLastKnownFileModified(),
        });
        if (!mountedRef.current) return false;
        if (result.ok) {
          lastPersistKeyRef.current = boardPersistKeyFromStoreState();
          syncDirty();
          return true;
        }
        if (result.reason === "conflict") {
          const snap = await readWorkingFileSnapshot();
          if (snap && mountedRef.current) {
            openConflictDialog(snap.lastModified);
          }
          return false;
        }
        console.error("Speichern in Arbeitsdatei fehlgeschlagen:", result.reason);
        syncDirty();
        return false;
      } finally {
        saveInFlightRef.current = false;
        if (mountedRef.current) onSavingChange?.(false);
      }
    };

    const schedulePersistOnChange = () => {
      if (!isWorkingFileAttached() || conflictPendingRef.current || suspendAutoPersistRef.current) {
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
      const key = boardPersistKeyFromStoreState();
      if (key === lastPersistKeyRef.current) return;
      lastPersistKeyRef.current = key;
      syncDirty();
      schedulePersistOnChange();
    };

    const checkExternalFile = async () => {
      const handle = getWorkingFileHandle();
      if (
        !handle ||
        shouldSuppressExternalFilePoll() ||
        conflictPendingRef.current ||
        suspendAutoPersistRef.current
      ) {
        return;
      }

      const snap = await readWorkingFileSnapshot(handle);
      if (!snap || !mountedRef.current) return;

      if (snap.lastModified <= getLastKnownFileModified()) return;
      if (snap.lastModified <= dismissedConflictRevisionRef.current) return;

      const synced = getLastSyncedBoardJson();
      if (boardStatesEquivalent(snap.text, synced ?? "")) {
        markWorkingFileSynced(snap.text, snap.lastModified);
        return;
      }

      const currentJson = boardJsonFromStoreState();
      const plan = planFileReconcile(currentJson, snap.text);

      if (plan.action === "in_sync") {
        markWorkingFileSynced(snap.text, snap.lastModified);
        return;
      }

      if (plan.action === "apply_file" && !isWorkingFileDirty(currentJson)) {
        suspendAutoPersistRef.current = true;
        try {
          if (snap.text.trim()) {
            applyBoardJsonToStore(snap.text);
          }
          markWorkingFileSynced(snap.text, snap.lastModified);
          lastPersistKeyRef.current = boardPersistKeyFromStoreState();
        } finally {
          suspendAutoPersistRef.current = false;
        }
        syncDirty();
        return;
      }

      if (plan.action === "conflict" || (plan.action === "apply_file" && isWorkingFileDirty(currentJson))) {
        openConflictDialog(snap.lastModified);
        return;
      }

      noteExternalFileRevision(snap.lastModified);
    };

    const addExternalListener = (target: EventTarget, type: string, listener: () => void) => {
      target.addEventListener(type, listener);
      externalListeners.push({ target, type, listener });
    };

    const bindExternalFileEvents = () => {
      const runCheck = () => {
        void checkExternalFile();
      };
      addExternalListener(window, "focus", runCheck);
      addExternalListener(window, "pageshow", runCheck);
      addExternalListener(document, "visibilitychange", () => {
        if (document.visibilityState === "visible") runCheck();
      });
    };

    void (async () => {
      await restoreWorkingFileFromDisk();
      if (!mountedRef.current) return;
      syncFileLabel();

      const handle = getWorkingFileHandle();
      if (handle) {
        try {
          const snap = await readWorkingFileSnapshot(handle);
          if (!mountedRef.current) return;
          if (snap?.text.trim()) {
            const localJson = boardJsonFromStoreState();
            const plan = planFileReconcile(localJson, snap.text);
            if (plan.action === "in_sync" || plan.action === "apply_file") {
              suspendAutoPersistRef.current = true;
              try {
                applyBoardJsonToStore(snap.text);
                markWorkingFileSynced(snap.text, snap.lastModified);
              } finally {
                suspendAutoPersistRef.current = false;
              }
            } else if (plan.action === "push_local") {
              markWorkingFileSynced(localJson, snap.lastModified);
              await flushPersist();
            } else {
              openConflictDialog(snap.lastModified);
            }
          } else if (snap) {
            const localJson = boardJsonFromStoreState();
            markWorkingFileSynced(localJson, snap.lastModified);
            await flushPersist();
          }
        } catch (e) {
          console.error("Arbeitsdatei beim Start:", e);
        }
      } else {
        onNeedsFileSetup?.();
      }

      if (!mountedRef.current) return;
      lastPersistKeyRef.current = boardPersistKeyFromStoreState();
      syncFileLabel();
      syncDirty();

      storeUnsub = useTaskTreeStore.subscribe(onPersistedBoardChanged);
      bindExternalFileEvents();

      const onPageHide = () => {
        void flushPersist();
      };
      window.addEventListener("pagehide", onPageHide);
      externalListeners.push({ target: window, type: "pagehide", listener: onPageHide });

      const onVisibilityHidden = () => {
        if (document.visibilityState === "hidden") void flushPersist();
      };
      document.addEventListener("visibilitychange", onVisibilityHidden);
      externalListeners.push({
        target: document,
        type: "visibilitychange",
        listener: onVisibilityHidden,
      });
    })();

    return () => {
      mountedRef.current = false;
      storeUnsub?.();
      for (const { target, type, listener } of externalListeners) {
        target.removeEventListener(type, listener);
      }
    };
  }, [onNeedsFileSetup, onSavingChange, syncDirty, syncFileLabel]);

  const handleConflictChoice = useCallback(
    async (choice: FileConflictChoice) => {
      if (conflictBusy) return;
      const handle = getWorkingFileHandle();
      if (!handle) return;

      if (choice === "defer") {
        const snap = await readWorkingFileSnapshot(handle);
        if (snap) {
          dismissedConflictRevisionRef.current = snap.lastModified;
          noteExternalFileRevision(snap.lastModified);
        }
        conflictPendingRef.current = false;
        setConflictOpen(false);
        syncDirty();
        return;
      }

      setConflictBusy(true);
      suspendAutoPersistRef.current = true;
      try {
        const snap = await readWorkingFileSnapshot(handle);
        if (!snap) return;

        if (choice === "load_file") {
          if (snap.text.trim()) {
            applyBoardJsonToStore(snap.text);
          }
          markWorkingFileSynced(snap.text, snap.lastModified);
          dismissedConflictRevisionRef.current = snap.lastModified;
          lastPersistKeyRef.current = boardPersistKeyFromStoreState();
          conflictPendingRef.current = false;
          setConflictOpen(false);
          syncDirty();
          return;
        }

        const json = boardJsonFromStoreState();
        const result = await writeWorkingFileJson(json, handle);
        if (!result.ok) {
          window.alert("Speichern in die Arbeitsdatei ist fehlgeschlagen. Bitte erneut versuchen.");
          dismissedConflictRevisionRef.current = 0;
          return;
        }
        dismissedConflictRevisionRef.current = result.lastModified;
        lastPersistKeyRef.current = boardPersistKeyFromStoreState();
        conflictPendingRef.current = false;
        setConflictOpen(false);
        syncDirty();
      } finally {
        suspendAutoPersistRef.current = false;
        setConflictBusy(false);
      }
    },
    [conflictBusy, syncDirty],
  );

  const workingFileLabel = getWorkingFileHandle()?.name?.trim() || null;

  return (
    <FileConflictDialog
        open={conflictOpen}
        fileName={workingFileLabel}
        busy={conflictBusy}
        onChoose={(choice) => void handleConflictChoice(choice)}
    />
  );
}
