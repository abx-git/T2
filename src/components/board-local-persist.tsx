"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

import { flushLocalBoardBackup, writeLocalBoardBackup } from "@/lib/board-local-backup";
import {
  flushLocalBoardMirror,
  readLocalBoardMirror,
  writeLocalBoardMirror,
} from "@/lib/board-local-mirror";
import {
  applyBoardJsonToStore,
  boardJsonFromTaskTreeState,
  hasOfflinePauseState,
  updateOfflineDraftJson,
} from "@/lib/server-board-offline";
import { useTaskTreeStore } from "@/store/task-tree-store";

const SAVE_DEBOUNCE_MS = 400;

function boardJsonFromStore(): string {
  return boardJsonFromTaskTreeState(useTaskTreeStore.getState());
}

function flushAllLocalCopies(): void {
  const json = boardJsonFromStore();
  flushLocalBoardMirror(json);
  flushLocalBoardBackup(json);
  if (hasOfflinePauseState()) {
    updateOfflineDraftJson(json);
  }
}

/**
 * Spiegelt den Board-Stand fortlaufend in localStorage und stellt ihn nach Neustart wieder her.
 */
export function BoardLocalPersist() {
  const restoredRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    if (hasOfflinePauseState()) return;

    const mirror = readLocalBoardMirror();
    if (!mirror?.json.trim()) return;

    if (useTaskTreeStore.getState().roots.length === 0) {
      applyBoardJsonToStore(mirror.json);
    }
  }, []);

  useEffect(() => {
    const scheduleSave = () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        const json = boardJsonFromStore();
        writeLocalBoardMirror(json);
        writeLocalBoardBackup(json);
      }, SAVE_DEBOUNCE_MS);
    };

    scheduleSave();

    const unsub = useTaskTreeStore.subscribe(scheduleSave);

    const onPageHide = () => flushAllLocalCopies();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushAllLocalCopies();
    };

    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      unsub();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
