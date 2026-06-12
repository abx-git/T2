"use client";

import { useEffect, useRef } from "react";

import {
  applyBoardJsonToStore,
  hasOfflinePauseState,
  hasOfflinePendingChanges,
  readOfflinePauseState,
  updateOfflineDraftJson,
} from "@/lib/server-board-offline";
import { useTaskTreeStore } from "@/store/task-tree-store";
import { stringifyExportedDocument, buildBoardSnapshot } from "@/lib/task-tree-json";

const DRAFT_DEBOUNCE_MS = 500;

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

export interface ServerBoardOfflineSyncProps {
  serverBoardEnabled: boolean;
  onOfflinePendingChange?: (pending: boolean) => void;
}

/** Offline-Entwurf wiederherstellen und bei Trennung der Verknüpfung lokal persistieren. */
export function ServerBoardOfflineSync({
  serverBoardEnabled,
  onOfflinePendingChange,
}: ServerBoardOfflineSyncProps) {
  const restoredRef = useRef(false);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onOfflinePendingChangeRef = useRef(onOfflinePendingChange);
  onOfflinePendingChangeRef.current = onOfflinePendingChange;

  useEffect(() => {
    if (restoredRef.current) return;
    if (serverBoardEnabled) return;
    const pause = readOfflinePauseState();
    if (!pause) return;
    const json = pause.draftJson?.trim() ? pause.draftJson : pause.localAtPauseJson;
    if (json.trim()) {
      applyBoardJsonToStore(json);
    }
    restoredRef.current = true;
    onOfflinePendingChangeRef.current?.(hasOfflinePendingChanges(boardJsonFromStore()));
  }, [serverBoardEnabled]);

  useEffect(() => {
    if (serverBoardEnabled) {
      onOfflinePendingChangeRef.current?.(false);
      return;
    }
    if (!hasOfflinePauseState()) {
      onOfflinePendingChangeRef.current?.(false);
      return;
    }

    const syncPending = () => {
      onOfflinePendingChangeRef.current?.(hasOfflinePendingChanges(boardJsonFromStore()));
    };

    syncPending();

    const unsub = useTaskTreeStore.subscribe(() => {
      syncPending();
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      draftTimerRef.current = setTimeout(() => {
        draftTimerRef.current = null;
        updateOfflineDraftJson(boardJsonFromStore());
      }, DRAFT_DEBOUNCE_MS);
    });

    return () => {
      unsub();
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [serverBoardEnabled]);

  return null;
}
