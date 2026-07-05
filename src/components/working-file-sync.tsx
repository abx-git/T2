"use client";

import { useEffect, useRef, type MutableRefObject } from "react";

import {
  applyBoardJsonToStore,
  boardJsonFromStoreState,
  boardPersistKeyFromStoreState,
  boardStatesEquivalent,
  mergeBoardJsonTexts,
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

export interface PendingFileConflict {
  fileText: string;
  fileLastModified: number;
}

export interface WorkingFileSyncProps {
  onWorkingFileNameChange: (fileName: string | null) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSavingChange?: (saving: boolean) => void;
  onNeedsFileSetup?: () => void;
  onConflict?: (conflict: PendingFileConflict) => void;
  conflictResolutionRef?: MutableRefObject<
    ((resolution: "load_file" | "keep_local" | "merge" | "cancel") => Promise<void>) | null
  >;
}

/**
 * Stellt die Arbeitsdatei beim Start wieder her, schreibt bei persistierten Board-Änderungen
 * und liest externe Dateiänderungen an sinnvollen Browser-Events (kein Intervall-Polling).
 */
export function WorkingFileSync({
  onWorkingFileNameChange,
  onDirtyChange,
  onSavingChange,
  onNeedsFileSetup,
  onConflict,
  conflictResolutionRef,
}: WorkingFileSyncProps) {
  const mountedRef = useRef(true);
  const saveQueuedRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const conflictPendingRef = useRef(false);
  const lastPersistKeyRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    let storeUnsub: (() => void) | undefined;
    const externalListeners: Array<{ target: EventTarget; type: string; listener: () => void }> = [];

    const syncFileLabel = () => {
      const h = getWorkingFileHandle();
      const name = h?.name?.trim() ? h.name : h ? "Arbeitsdatei" : null;
      onWorkingFileNameChange(name);
    };

    const syncDirty = () => {
      onDirtyChange?.(isWorkingFileDirty(boardJsonFromStoreState()));
    };

    const flushPersist = async (): Promise<boolean> => {
      if (!isWorkingFileAttached() || saveInFlightRef.current || conflictPendingRef.current) {
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
            conflictPendingRef.current = true;
            onConflict?.({ fileText: snap.text, fileLastModified: snap.lastModified });
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
      if (!isWorkingFileAttached() || conflictPendingRef.current) return;
      if (saveQueuedRef.current) return;
      saveQueuedRef.current = true;
      queueMicrotask(() => {
        saveQueuedRef.current = false;
        void flushPersist();
      });
    };

    const onPersistedBoardChanged = () => {
      const key = boardPersistKeyFromStoreState();
      if (key === lastPersistKeyRef.current) return;
      lastPersistKeyRef.current = key;
      syncDirty();
      schedulePersistOnChange();
    };

    const checkExternalFile = async () => {
      const handle = getWorkingFileHandle();
      if (!handle || shouldSuppressExternalFilePoll() || conflictPendingRef.current) return;

      const snap = await readWorkingFileSnapshot(handle);
      if (!snap || !mountedRef.current) return;

      if (snap.lastModified <= getLastKnownFileModified()) return;

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
        if (snap.text.trim()) {
          applyBoardJsonToStore(snap.text);
          lastPersistKeyRef.current = boardPersistKeyFromStoreState();
        }
        markWorkingFileSynced(snap.text, snap.lastModified);
        syncDirty();
        return;
      }

      if (plan.action === "conflict" || (plan.action === "apply_file" && isWorkingFileDirty(currentJson))) {
        conflictPendingRef.current = true;
        onConflict?.({ fileText: snap.text, fileLastModified: snap.lastModified });
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

    const resolveConflict = async (resolution: "load_file" | "keep_local" | "merge" | "cancel") => {
      if (resolution === "cancel") {
        conflictPendingRef.current = false;
        const handle = getWorkingFileHandle();
        if (handle) {
          const snap = await readWorkingFileSnapshot(handle);
          if (snap) noteExternalFileRevision(snap.lastModified);
        }
        return;
      }
      conflictPendingRef.current = false;
      const handle = getWorkingFileHandle();
      if (!handle) return;

      const snap = await readWorkingFileSnapshot(handle);
      if (!snap) return;

      const localJson = boardJsonFromStoreState();

      if (resolution === "load_file") {
        if (snap.text.trim()) {
          applyBoardJsonToStore(snap.text);
        }
        markWorkingFileSynced(snap.text, snap.lastModified);
        lastPersistKeyRef.current = boardPersistKeyFromStoreState();
        syncDirty();
        return;
      }

      if (resolution === "merge") {
        const mergedJson = mergeBoardJsonTexts(localJson, snap.text);
        if (!mergedJson) {
          window.alert("Zusammenführen fehlgeschlagen — ungültige Dateidaten.");
          conflictPendingRef.current = true;
          return;
        }
        applyBoardJsonToStore(mergedJson);
        const result = await writeWorkingFileJson(mergedJson, handle, {
          expectedLastModified: snap.lastModified,
        });
        if (!result.ok) {
          if (result.reason === "conflict") {
            conflictPendingRef.current = true;
            const fresh = await readWorkingFileSnapshot(handle);
            if (fresh) onConflict?.({ fileText: fresh.text, fileLastModified: fresh.lastModified });
          } else {
            window.alert("Zusammengeführte Daten konnten nicht in die Datei geschrieben werden.");
          }
        }
        lastPersistKeyRef.current = boardPersistKeyFromStoreState();
        syncDirty();
        return;
      }

      const result = await writeWorkingFileJson(localJson, handle, {
        expectedLastModified: snap.lastModified,
      });
      if (!result.ok) {
        if (result.reason === "conflict") {
          conflictPendingRef.current = true;
          const fresh = await readWorkingFileSnapshot(handle);
          if (fresh) onConflict?.({ fileText: fresh.text, fileLastModified: fresh.lastModified });
        } else {
          window.alert("Lokale Änderungen konnten nicht in die Datei geschrieben werden.");
        }
      }
      lastPersistKeyRef.current = boardPersistKeyFromStoreState();
      syncDirty();
    };

    if (conflictResolutionRef) {
      conflictResolutionRef.current = resolveConflict;
    }

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
              applyBoardJsonToStore(snap.text);
              markWorkingFileSynced(snap.text, snap.lastModified);
            } else if (plan.action === "push_local") {
              markWorkingFileSynced(localJson, snap.lastModified);
              await flushPersist();
            } else {
              conflictPendingRef.current = true;
              onConflict?.({ fileText: snap.text, fileLastModified: snap.lastModified });
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
      if (conflictResolutionRef) conflictResolutionRef.current = null;
      storeUnsub?.();
      for (const { target, type, listener } of externalListeners) {
        target.removeEventListener(type, listener);
      }
    };
  }, [conflictResolutionRef, onConflict, onDirtyChange, onNeedsFileSetup, onSavingChange, onWorkingFileNameChange]);

  return null;
}
