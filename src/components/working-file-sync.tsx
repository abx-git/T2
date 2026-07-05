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
  getWorkingFileHandle,
  getWorkingFileLabel,
  isKnownFileRevision,
  isWorkingFileAttached,
  isWorkingFileDirty,
  markWorkingFileSessionHydrated,
  markWorkingFileSynced,
  readWorkingFileSnapshot,
  restoreWorkingFileFromDisk,
  shouldSuppressExternalFilePoll,
  wasWorkingFileSessionHydrated,
  writeWorkingFileJson,
  persistWorkingFileJson,
  isMobileWorkingFileMode,
  getLastSyncedBoardJson,
} from "@/lib/working-file";
import { useTaskTreeStore } from "@/store/task-tree-store";

export interface WorkingFileSyncProps {
  onWorkingFileNameChange: (fileName: string | null) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSavingChange?: (saving: boolean) => void;
  onNeedsFileSetup?: () => void;
}

type WorkingFileSyncCallbacks = Pick<
  WorkingFileSyncProps,
  "onWorkingFileNameChange" | "onDirtyChange" | "onSavingChange" | "onNeedsFileSetup"
>;

/**
 * Arbeitsdatei-Sync pro Tab:
 * - Einmal beim Start aus Datei laden
 * - Bei Board-Änderungen sofort speichern (eventbasiert)
 * - Externe Änderungen nur bei neuem Datei-Zeitstempel; eigene Speicherungen ignorieren
 */
export function WorkingFileSync({
  onWorkingFileNameChange,
  onDirtyChange,
  onSavingChange,
  onNeedsFileSetup,
}: WorkingFileSyncProps) {
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictBusy, setConflictBusy] = useState(false);

  const callbacksRef = useRef<WorkingFileSyncCallbacks>({
    onWorkingFileNameChange,
    onDirtyChange,
    onSavingChange,
    onNeedsFileSetup,
  });
  callbacksRef.current = {
    onWorkingFileNameChange,
    onDirtyChange,
    onSavingChange,
    onNeedsFileSetup,
  };

  const mountedRef = useRef(true);
  const saveQueuedRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const suspendAutoPersistRef = useRef(false);
  const conflictActiveRef = useRef(false);
  const lastPersistKeyRef = useRef<string | null>(null);

  const syncFileLabel = () => {
    const name = getWorkingFileLabel();
    callbacksRef.current.onWorkingFileNameChange(name);
  };

  const syncDirty = () => {
    callbacksRef.current.onDirtyChange?.(isWorkingFileDirty());
  };

  const handleConflictChoice = useCallback(async (choice: FileConflictChoice) => {
    if (conflictBusy) return;
    const handle = getWorkingFileHandle();
    if (!handle) return;

    setConflictBusy(true);
    suspendAutoPersistRef.current = true;
    setConflictOpen(false);

    try {
      const snap = await readWorkingFileSnapshot(handle);
      if (!snap) return;

      if (choice === "load_file") {
        if (snap.text.trim()) applyBoardJsonToStore(snap.text);
        markWorkingFileSynced(snap.text, snap.lastModified);
        lastPersistKeyRef.current = boardPersistKeyFromStoreState();
        syncDirty();
        return;
      }

      const json = boardJsonFromStoreState();
      const result = isMobileWorkingFileMode()
        ? await persistWorkingFileJson(json)
        : await writeWorkingFileJson(json, handle);
      if (!result.ok) {
        window.alert("Speichern ist fehlgeschlagen. Bitte erneut versuchen.");
        setConflictOpen(true);
        return;
      }
      lastPersistKeyRef.current = boardPersistKeyFromStoreState();
      syncDirty();
    } finally {
      conflictActiveRef.current = false;
      suspendAutoPersistRef.current = false;
      setConflictBusy(false);
    }
  }, [conflictBusy]);

  useEffect(() => {
    mountedRef.current = true;
    let storeUnsub: (() => void) | undefined;
    const externalListeners: Array<{ target: EventTarget; type: string; listener: () => void }> = [];

    const flushPersist = async (): Promise<boolean> => {
      if (
        !isWorkingFileAttached() ||
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
        console.error("Speichern in Arbeitsdatei fehlgeschlagen:", result.reason);
        syncDirty();
        return false;
      } finally {
        saveInFlightRef.current = false;
        if (mountedRef.current) callbacksRef.current.onSavingChange?.(false);
      }
    };

    const schedulePersistOnChange = () => {
      if (!isWorkingFileAttached() || conflictActiveRef.current || suspendAutoPersistRef.current) {
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

    /**
     * Externe Änderung = neuer Datei-Zeitstempel (nicht von T2 geschrieben).
     * Lokale Bearbeitungen ohne Datei-Änderung werden ignoriert.
     */
    const applyExternalFileIfNeeded = async () => {
      if (isMobileWorkingFileMode()) return;
      if (
        conflictActiveRef.current ||
        suspendAutoPersistRef.current ||
        saveInFlightRef.current ||
        shouldSuppressExternalFilePoll()
      ) {
        return;
      }

      const handle = getWorkingFileHandle();
      if (!handle) return;

      const snap = await readWorkingFileSnapshot(handle);
      if (!snap || !mountedRef.current) return;

      if (isKnownFileRevision(snap.lastModified)) return;

      const localJson = boardJsonFromStoreState();
      if (boardStatesEquivalent(snap.text, localJson)) {
        markWorkingFileSynced(snap.text, snap.lastModified);
        syncDirty();
        return;
      }

      if (!isWorkingFileDirty()) {
        suspendAutoPersistRef.current = true;
        try {
          if (snap.text.trim()) applyBoardJsonToStore(snap.text);
          markWorkingFileSynced(snap.text, snap.lastModified);
          lastPersistKeyRef.current = boardPersistKeyFromStoreState();
        } finally {
          suspendAutoPersistRef.current = false;
        }
        syncDirty();
        return;
      }

      conflictActiveRef.current = true;
      setConflictOpen(true);
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
            applyBoardJsonToStore(snap.text);
            markWorkingFileSynced(snap.text, snap.lastModified);
          } else {
            markWorkingFileSynced(boardJsonFromStoreState(), snap.lastModified);
            await flushPersist();
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
          applyBoardJsonToStore(synced);
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
      await restoreWorkingFileFromDisk();
      if (!mountedRef.current) return;

      await hydrateFromWorkingFileOnce();
      if (!mountedRef.current) return;

      lastPersistKeyRef.current = boardPersistKeyFromStoreState();
      syncFileLabel();
      syncDirty();

      storeUnsub = useTaskTreeStore.subscribe(onPersistedBoardChanged);

      const runExternalCheck = () => void applyExternalFileIfNeeded();
      addExternalListener(window, "focus", runExternalCheck);
      addExternalListener(window, "pageshow", runExternalCheck);
      addExternalListener(document, "visibilitychange", () => {
        if (document.visibilityState === "visible") runExternalCheck();
      });

      const onPageHide = () => void flushPersist();
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
  }, []);

  const workingFileLabel = getWorkingFileLabel();

  return (
    <FileConflictDialog
      open={conflictOpen}
      fileName={workingFileLabel}
      busy={conflictBusy}
      onChoose={(choice) => void handleConflictChoice(choice)}
    />
  );
}
