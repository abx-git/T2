"use client";

import { useEffect, useRef } from "react";

import {
  applyBoardJsonToStore,
  boardJsonFromStoreState,
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

const EXTERNAL_POLL_MS = 500;

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
  /** Wird gesetzt, wenn ein Konflikt gelöst wurde und die Datei neu geschrieben werden soll. */
  conflictResolutionRef?: React.MutableRefObject<((resolution: "load_file" | "keep_local" | "merge") => Promise<void>) | null>;
}

/**
 * Stellt die Arbeitsdatei beim Start wieder her, speichert Änderungen sofort
 * und übernimmt externe Dateiänderungen (mit Konfliktschutz).
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

  useEffect(() => {
    mountedRef.current = true;
    let storeUnsub: (() => void) | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    const syncFileLabel = () => {
      const h = getWorkingFileHandle();
      const name = h?.name?.trim() ? h.name : h ? "Arbeitsdatei" : null;
      onWorkingFileNameChange(name);
    };

    const syncDirty = () => {
      onDirtyChange?.(isWorkingFileDirty(boardJsonFromStoreState()));
    };

    const flushAutoSave = async (): Promise<boolean> => {
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
        console.error("Auto-Save in Arbeitsdatei fehlgeschlagen:", result.reason);
        syncDirty();
        return false;
      } finally {
        saveInFlightRef.current = false;
        if (mountedRef.current) onSavingChange?.(false);
      }
    };

    const scheduleAutoSave = () => {
      if (!isWorkingFileAttached() || conflictPendingRef.current) return;
      if (saveQueuedRef.current) return;
      saveQueuedRef.current = true;
      queueMicrotask(() => {
        saveQueuedRef.current = false;
        void flushAutoSave();
      });
    };

    const applyExternalFile = async () => {
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

    const resolveConflict = async (resolution: "load_file" | "keep_local" | "merge") => {
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
        syncDirty();
        return;
      }

      // keep_local
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
              await flushAutoSave();
            } else {
              conflictPendingRef.current = true;
              onConflict?.({ fileText: snap.text, fileLastModified: snap.lastModified });
            }
          } else if (snap) {
            const localJson = boardJsonFromStoreState();
            markWorkingFileSynced(localJson, snap.lastModified);
            await flushAutoSave();
          }
        } catch (e) {
          console.error("Arbeitsdatei beim Start:", e);
        }
      } else {
        onNeedsFileSetup?.();
      }

      if (!mountedRef.current) return;
      syncFileLabel();
      syncDirty();

      storeUnsub = useTaskTreeStore.subscribe(() => {
        syncDirty();
        scheduleAutoSave();
      });

      pollTimer = setInterval(() => {
        void applyExternalFile();
      }, EXTERNAL_POLL_MS);

      const onPageHide = () => {
        void flushAutoSave();
      };
      window.addEventListener("pagehide", onPageHide);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") void flushAutoSave();
      });
    })();

    return () => {
      mountedRef.current = false;
      if (conflictResolutionRef) conflictResolutionRef.current = null;
      storeUnsub?.();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [conflictResolutionRef, onConflict, onDirtyChange, onNeedsFileSetup, onSavingChange, onWorkingFileNameChange]);

  return null;
}
