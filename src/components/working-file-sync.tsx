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
  stableKeyFromJson,
} from "@/lib/file-board-reconcile";
import {
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

type AcknowledgedConflict = { fileKey: string; localKey: string };

const CONFLICT_CHECK_COOLDOWN_MS = 3000;

/**
 * Arbeitsdatei: laden beim Start, bei Board-Änderungen speichern,
 * bei echtem Datei-Unterschied einmalig nachfragen.
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
  const suspendAutoPersistRef = useRef(false);
  const conflictActiveRef = useRef(false);
  const lastPersistKeyRef = useRef<string | null>(null);
  const acknowledgedConflictRef = useRef<AcknowledgedConflict | null>(null);
  const conflictCheckCooldownUntilRef = useRef(0);

  const syncFileLabel = useCallback(() => {
    const h = getWorkingFileHandle();
    const name = h?.name?.trim() ? h.name : h ? "Arbeitsdatei" : null;
    onWorkingFileNameChange(name);
  }, [onWorkingFileNameChange]);

  const syncDirty = useCallback(() => {
    onDirtyChange?.(isWorkingFileDirty());
  }, [onDirtyChange]);

  const acknowledgeConflictPair = useCallback((fileText: string) => {
    const fileKey = stableKeyFromJson(fileText);
    const localKey = boardPersistKeyFromStoreState();
    if (fileKey) {
      acknowledgedConflictRef.current = { fileKey, localKey };
    }
    conflictCheckCooldownUntilRef.current = Date.now() + CONFLICT_CHECK_COOLDOWN_MS;
  }, []);

  const shouldPromptForDifference = useCallback((fileText: string): boolean => {
    if (conflictActiveRef.current) return false;
    if (Date.now() < conflictCheckCooldownUntilRef.current) return false;
    if (shouldSuppressExternalFilePoll()) return false;

    const fileKey = stableKeyFromJson(fileText);
    const localKey = boardPersistKeyFromStoreState();
    if (!fileKey || fileKey === localKey) return false;

    const ack = acknowledgedConflictRef.current;
    if (ack && ack.fileKey === fileKey && ack.localKey === localKey) return false;

    return true;
  }, []);

  const openConflictIfNeeded = useCallback(
    (fileText: string, fileLastModified: number) => {
      if (!shouldPromptForDifference(fileText)) {
        noteExternalFileRevision(fileLastModified);
        return;
      }
      conflictActiveRef.current = true;
      setConflictOpen(true);
    },
    [shouldPromptForDifference],
  );

  const handleConflictChoice = useCallback(
    async (choice: FileConflictChoice) => {
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
          acknowledgeConflictPair(snap.text);
          syncDirty();
          return;
        }

        const json = boardJsonFromStoreState();
        const result = await writeWorkingFileJson(json, handle);
        if (!result.ok) {
          window.alert("Speichern ist fehlgeschlagen. Bitte erneut versuchen.");
          setConflictOpen(true);
          return;
        }
        lastPersistKeyRef.current = boardPersistKeyFromStoreState();
        acknowledgeConflictPair(json);
        syncDirty();
      } finally {
        conflictActiveRef.current = false;
        suspendAutoPersistRef.current = false;
        setConflictBusy(false);
      }
    },
    [acknowledgeConflictPair, conflictBusy, syncDirty],
  );

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
      onSavingChange?.(true);
      try {
        const json = boardJsonFromStoreState();
        const result = await writeWorkingFileJson(json);
        if (!mountedRef.current) return false;
        if (result.ok) {
          lastPersistKeyRef.current = boardPersistKeyFromStoreState();
          acknowledgeConflictPair(json);
          syncDirty();
          return true;
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

    const checkExternalFile = async () => {
      if (conflictActiveRef.current || suspendAutoPersistRef.current) return;
      if (Date.now() < conflictCheckCooldownUntilRef.current) return;

      const handle = getWorkingFileHandle();
      if (!handle || shouldSuppressExternalFilePoll()) return;

      const snap = await readWorkingFileSnapshot(handle);
      if (!snap || !mountedRef.current) return;

      const localJson = boardJsonFromStoreState();
      if (boardStatesEquivalent(snap.text, localJson)) {
        markWorkingFileSynced(snap.text, snap.lastModified);
        lastPersistKeyRef.current = boardPersistKeyFromStoreState();
        acknowledgeConflictPair(snap.text);
        syncDirty();
        return;
      }

      const plan = planFileReconcile(localJson, snap.text);
      if (plan.action === "in_sync") {
        markWorkingFileSynced(snap.text, snap.lastModified);
        acknowledgeConflictPair(snap.text);
        return;
      }

      if (plan.action === "apply_file") {
        suspendAutoPersistRef.current = true;
        try {
          if (snap.text.trim()) applyBoardJsonToStore(snap.text);
          markWorkingFileSynced(snap.text, snap.lastModified);
          lastPersistKeyRef.current = boardPersistKeyFromStoreState();
          acknowledgeConflictPair(snap.text);
        } finally {
          suspendAutoPersistRef.current = false;
        }
        syncDirty();
        return;
      }

      if (plan.action === "push_local") {
        await flushPersist();
        return;
      }

      openConflictIfNeeded(snap.text, snap.lastModified);
    };

    const addExternalListener = (target: EventTarget, type: string, listener: () => void) => {
      target.addEventListener(type, listener);
      externalListeners.push({ target, type, listener });
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
                acknowledgeConflictPair(snap.text);
              } finally {
                suspendAutoPersistRef.current = false;
              }
            } else if (plan.action === "push_local") {
              markWorkingFileSynced(localJson, snap.lastModified);
              await flushPersist();
            } else {
              openConflictIfNeeded(snap.text, snap.lastModified);
            }
          } else if (snap) {
            markWorkingFileSynced(boardJsonFromStoreState(), snap.lastModified);
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

      const runCheck = () => void checkExternalFile();
      addExternalListener(window, "focus", runCheck);
      addExternalListener(window, "pageshow", runCheck);
      addExternalListener(document, "visibilitychange", () => {
        if (document.visibilityState === "visible") runCheck();
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
  }, [acknowledgeConflictPair, onNeedsFileSetup, onSavingChange, openConflictIfNeeded, syncDirty, syncFileLabel]);

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
