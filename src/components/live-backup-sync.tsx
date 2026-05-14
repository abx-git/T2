"use client";

import { useEffect, useRef } from "react";

import {
  buildBoardSnapshot,
  boardSnapshotToReplacePayload,
  isBoardSnapshot,
  parseExportedDocument,
  stringifyExportedDocument,
} from "@/lib/task-tree-json";
import {
  getLiveBackupHandle,
  isPersistedBoardJsonDirty,
  markPersistedBoardJson,
  readFullJsonFromHandle,
  restoreLiveBackupTargetFromDisk,
} from "@/lib/live-backup";
import { useTaskTreeStore } from "@/store/task-tree-store";

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
    ),
  );
}

export interface LiveBackupSyncProps {
  onActiveFileNameChange: (fileName: string | null) => void;
  onPersistDirtyChange?: (dirty: boolean) => void;
}

/**
 * Stellt die Speicherdatei wieder her, lädt den Stand beim Start, hält „ungesichert“-Status
 * (Abgleich letzter erfolgreicher Schreibvorgang vs. aktueller Export) und abonniert Store-Änderungen.
 * Schreiben in die Datei erfolgt nur noch explizit über den Speichern-Button (TaskBoard).
 */
export function LiveBackupSync({ onActiveFileNameChange, onPersistDirtyChange }: LiveBackupSyncProps) {
  const onDirty = onPersistDirtyChange;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let unsub: (() => void) | undefined;

    const syncDirtyFlag = () => {
      if (!onDirty) return;
      const json = boardJsonFromStore();
      onDirty(isPersistedBoardJsonDirty(json));
    };

    void (async () => {
      await restoreLiveBackupTargetFromDisk();
      if (!mountedRef.current) return;
      const syncActiveFileLabel = () => {
        const active = getLiveBackupHandle();
        const label =
          active?.name != null && active.name.trim() !== "" ? active.name : active ? "Speicherdatei" : null;
        onActiveFileNameChange(label);
      };
      syncActiveFileLabel();

      const handleForRead = getLiveBackupHandle();
      if (handleForRead) {
        try {
          const text = await readFullJsonFromHandle(handleForRead);
          if (!mountedRef.current) return;
          if (text?.trim()) {
            const doc = parseExportedDocument(text);
            if (isBoardSnapshot(doc)) {
              useTaskTreeStore.getState().replaceBoardFromImport(boardSnapshotToReplacePayload(doc));
            }
          }
        } catch (e) {
          console.error("Speicherdatei beim Start einlesen:", e);
        }
      }

      if (!mountedRef.current) return;
      syncActiveFileLabel();
      markPersistedBoardJson(boardJsonFromStore());
      onDirty?.(false);

      unsub = useTaskTreeStore.subscribe(() => {
        syncDirtyFlag();
      });
      syncDirtyFlag();
    })();

    return () => {
      mountedRef.current = false;
      unsub?.();
    };
  }, [onActiveFileNameChange, onDirty]);

  return null;
}
