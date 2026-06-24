"use client";

import { useEffect, useRef } from "react";

import { applyBoardJsonToStore } from "@/lib/server-board-offline";
import { reconcileInitialServerBoard } from "@/lib/server-board-reconcile";
import {
  boardExportTextsEquivalent,
  buildBoardSnapshot,
  stringifyExportedDocument,
} from "@/lib/task-tree-json";
import {
  fetchBoardEtagFromServer,
  fetchBoardFromServer,
  getLastKnownEtag,
  getLastSyncedBoardJson,
  isServerBoardDirty,
  markServerBoardSynced,
  shouldSuppressExternalServerPoll,
  writeBoardToServer,
} from "@/lib/server-board";
import { isBrowserNetworkOnline, isFetchNetworkError } from "@/lib/server-board-network";
import { useTaskTreeStore } from "@/store/task-tree-store";

const AUTO_SAVE_DEBOUNCE_MS = 700;
const EXTERNAL_POLL_MS = 5000;

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

export interface ServerBoardSyncProps {
  enabled: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onSavingChange?: (saving: boolean) => void;
  onConnectFailed?: () => void;
  onNetworkUnavailable?: () => void;
}

export function ServerBoardSync({
  enabled,
  onDirtyChange,
  onSavingChange,
  onConnectFailed,
  onNetworkUnavailable,
}: ServerBoardSyncProps) {
  const mountedRef = useRef(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef(false);
  const initialLoadDoneRef = useRef(false);

  const onDirtyChangeRef = useRef(onDirtyChange);
  const onSavingChangeRef = useRef(onSavingChange);
  const onConnectFailedRef = useRef(onConnectFailed);
  const onNetworkUnavailableRef = useRef(onNetworkUnavailable);
  onDirtyChangeRef.current = onDirtyChange;
  onSavingChangeRef.current = onSavingChange;
  onConnectFailedRef.current = onConnectFailed;
  onNetworkUnavailableRef.current = onNetworkUnavailable;

  useEffect(() => {
    if (!enabled) {
      initialLoadDoneRef.current = false;
      return;
    }

    mountedRef.current = true;
    let storeUnsub: (() => void) | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    const syncDirty = () => {
      onDirtyChangeRef.current?.(isServerBoardDirty(boardJsonFromStore()));
    };

    const enterOfflineFromNetwork = () => {
      onNetworkUnavailableRef.current?.();
    };

    const flushAutoSave = async () => {
      if (!enabled || saveInFlightRef.current) return;
      if (!isBrowserNetworkOnline()) {
        enterOfflineFromNetwork();
        return;
      }
      const json = boardJsonFromStore();
      if (!isServerBoardDirty(json)) {
        syncDirty();
        return;
      }
      saveInFlightRef.current = true;
      onSavingChangeRef.current?.(true);
      try {
        const etag = getLastKnownEtag();
        await writeBoardToServer(json, etag);
        if (!mountedRef.current) return;
        syncDirty();
      } catch (e) {
        if (isFetchNetworkError(e)) {
          enterOfflineFromNetwork();
          return;
        }
        if (e instanceof Error && e.message === "precondition_failed") {
          const remote = await fetchBoardFromServer();
          if (!remote) return;
          const localJson = boardJsonFromStore();
          if (boardExportTextsEquivalent(remote.text, localJson)) {
            markServerBoardSynced(localJson, remote.etag);
            await writeBoardToServer(localJson, remote.etag);
            syncDirty();
            return;
          }
          const discard = window.confirm(
            "Ein anderes Gerät hat das Board geändert. Lokale Änderungen verwerfen und die Server-Version laden?",
          );
          if (!discard) {
            markServerBoardSynced(localJson, remote.etag);
            return;
          }
          applyBoardJsonToStore(remote.text);
          markServerBoardSynced(remote.text, remote.etag);
          syncDirty();
        } else {
          console.error("Auto-Save Vault:", e);
        }
      } finally {
        saveInFlightRef.current = false;
        if (mountedRef.current) onSavingChangeRef.current?.(false);
      }
    };

    const scheduleAutoSave = () => {
      if (!enabled || !isBrowserNetworkOnline()) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        void flushAutoSave();
      }, AUTO_SAVE_DEBOUNCE_MS);
    };

    const applyExternalBoard = async () => {
      if (!enabled || !isBrowserNetworkOnline() || shouldSuppressExternalServerPoll()) return;
      if (saveInFlightRef.current || saveTimerRef.current) return;

      let head;
      try {
        const knownEtag = getLastKnownEtag();
        head = await fetchBoardEtagFromServer();
        if (!head || !mountedRef.current) return;
        if (knownEtag && head.etag === knownEtag) return;
      } catch (e) {
        if (isFetchNetworkError(e)) enterOfflineFromNetwork();
        return;
      }

      let snap;
      try {
        snap = await fetchBoardFromServer();
      } catch (e) {
        if (isFetchNetworkError(e)) enterOfflineFromNetwork();
        return;
      }
      if (!snap || !mountedRef.current) return;

      const currentJson = boardJsonFromStore();

      if (boardExportTextsEquivalent(snap.text, currentJson)) {
        markServerBoardSynced(currentJson, snap.etag);
        syncDirty();
        return;
      }

      const synced = getLastSyncedBoardJson();
      if (synced && boardExportTextsEquivalent(snap.text, synced)) {
        markServerBoardSynced(synced, snap.etag);
        return;
      }

      if (isServerBoardDirty(currentJson)) return;

      if (snap.text.trim() && !applyBoardJsonToStore(snap.text)) {
        console.error("Vault einlesen: ungültiges JSON");
        return;
      }

      markServerBoardSynced(snap.text, snap.etag);
      syncDirty();
    };

    const loadInitial = async () => {
      try {
        const snap = await fetchBoardFromServer();
        if (!mountedRef.current) return;

        const localJson = boardJsonFromStore();
        const result = await reconcileInitialServerBoard(localJson, snap ?? { text: "", etag: '""', lastModified: 0 });
        if (!mountedRef.current) return;

        if (!result.ok) {
          if (result.reason === "cancelled") {
            window.alert("Server-Verknüpfung nicht hergestellt — Abgleich abgebrochen.");
          } else if (result.reason === "decrypt_error") {
            window.alert("Entschlüsselung fehlgeschlagen — LOX-ID prüfen.");
          } else {
            window.alert("Abgleich mit dem Server ist fehlgeschlagen.");
          }
          onConnectFailedRef.current?.();
          return;
        }

        initialLoadDoneRef.current = true;
        onDirtyChangeRef.current?.(false);
        syncDirty();
      } catch (e) {
        console.error("Vault beim Start:", e);
        onConnectFailedRef.current?.();
      }
    };

    void (async () => {
      await loadInitial();
      if (!mountedRef.current) return;

      storeUnsub = useTaskTreeStore.subscribe(() => {
        if (!initialLoadDoneRef.current) return;
        syncDirty();
        scheduleAutoSave();
      });

      pollTimer = setInterval(() => {
        if (document.visibilityState === "hidden") return;
        void applyExternalBoard();
      }, EXTERNAL_POLL_MS);
    })();

    return () => {
      mountedRef.current = false;
      storeUnsub?.();
      if (pollTimer) clearInterval(pollTimer);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [enabled]);

  return null;
}
