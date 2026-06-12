"use client";

import { useEffect, useRef } from "react";

import {
  boardSnapshotToReplacePayload,
  buildBoardSnapshot,
  isBoardSnapshot,
  parseExportedDocument,
  stringifyExportedDocument,
} from "@/lib/task-tree-json";
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

const AUTO_SAVE_DEBOUNCE_MS = 700;
const EXTERNAL_POLL_MS = 2000;

function boardJsonFromStore(): string {
  const s = useTaskTreeStore.getState();
  return stringifyExportedDocument(
    buildBoardSnapshot(
      s.roots,
      s.pathIds,
      s.columnTitleOverrides,
      s.cardFieldVisibility,
      s.hideCompletedTasks,
      s.effortOnTasksEnabled,
      s.filterTags,
      s.completedTag,
      s.collapsedIds,
    ),
  );
}

export interface WorkingFileSyncProps {
  onWorkingFileNameChange: (fileName: string | null) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSavingChange?: (saving: boolean) => void;
}

/**
 * Stellt die verknüpfte Arbeitsdatei wieder her, lädt beim Start,
 * speichert Änderungen automatisch (entprellt) und übernimmt externe Dateiänderungen.
 */
export function WorkingFileSync({
  onWorkingFileNameChange,
  onDirtyChange,
  onSavingChange,
}: WorkingFileSyncProps) {
  const mountedRef = useRef(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef(false);

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
      onDirtyChange?.(isWorkingFileDirty(boardJsonFromStore()));
    };

    const flushAutoSave = async () => {
      if (!isWorkingFileAttached() || saveInFlightRef.current) return;
      const json = boardJsonFromStore();
      if (!isWorkingFileDirty(json)) {
        syncDirty();
        return;
      }
      saveInFlightRef.current = true;
      onSavingChange?.(true);
      try {
        const ok = await writeWorkingFileJson(json);
        if (!mountedRef.current) return;
        if (!ok) console.error("Auto-Save in Arbeitsdatei fehlgeschlagen.");
        syncDirty();
      } finally {
        saveInFlightRef.current = false;
        if (mountedRef.current) onSavingChange?.(false);
      }
    };

    const scheduleAutoSave = () => {
      if (!isWorkingFileAttached()) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        void flushAutoSave();
      }, AUTO_SAVE_DEBOUNCE_MS);
    };

    const applyExternalFile = async () => {
      const handle = getWorkingFileHandle();
      if (!handle || shouldSuppressExternalFilePoll()) return;

      const snap = await readWorkingFileSnapshot(handle);
      if (!snap || !mountedRef.current) return;

      if (snap.lastModified <= getLastKnownFileModified()) return;

      const synced = getLastSyncedBoardJson();
      if (snap.text === synced) {
        markWorkingFileSynced(snap.text, snap.lastModified);
        return;
      }

      const currentJson = boardJsonFromStore();
      const localDirty = isWorkingFileDirty(currentJson);

      if (localDirty && snap.text.trim()) {
        const discard = window.confirm(
          "Die Arbeitsdatei wurde außerhalb von T2 geändert. Lokale Änderungen verwerfen und die Datei laden?",
        );
        if (!discard) {
          noteExternalFileRevision(snap.lastModified);
          return;
        }
      }

      if (snap.text.trim()) {
        try {
          const doc = parseExportedDocument(snap.text);
          if (isBoardSnapshot(doc)) {
            useTaskTreeStore.getState().replaceBoardFromImport(boardSnapshotToReplacePayload(doc));
          }
        } catch (e) {
          console.error("Externe Arbeitsdatei einlesen:", e);
          return;
        }
      }

      markWorkingFileSynced(snap.text, snap.lastModified);
      syncDirty();
    };

    void (async () => {
      await restoreWorkingFileFromDisk();
      if (!mountedRef.current) return;
      syncFileLabel();

      const handle = getWorkingFileHandle();
      if (handle) {
        try {
          const snap = await readWorkingFileSnapshot(handle);
          if (snap?.text.trim()) {
            const doc = parseExportedDocument(snap.text);
            if (isBoardSnapshot(doc)) {
              useTaskTreeStore.getState().replaceBoardFromImport(boardSnapshotToReplacePayload(doc));
            }
            markWorkingFileSynced(snap.text, snap.lastModified);
          } else if (snap) {
            markWorkingFileSynced(boardJsonFromStore(), snap.lastModified);
          }
        } catch (e) {
          console.error("Arbeitsdatei beim Start:", e);
        }
      }

      if (!mountedRef.current) return;
      syncFileLabel();
      onDirtyChange?.(false);
      syncDirty();

      storeUnsub = useTaskTreeStore.subscribe(() => {
        syncDirty();
        scheduleAutoSave();
      });

      pollTimer = setInterval(() => {
        if (document.visibilityState === "hidden") return;
        void applyExternalFile();
      }, EXTERNAL_POLL_MS);
    })();

    return () => {
      mountedRef.current = false;
      storeUnsub?.();
      if (pollTimer) clearInterval(pollTimer);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [onDirtyChange, onSavingChange, onWorkingFileNameChange]);

  return null;
}
