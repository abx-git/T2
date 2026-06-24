"use client";

import { useEffect, useRef } from "react";

import { applyBoardJsonToStore } from "@/lib/server-board-offline";
import { reconcileInitialServerBoard } from "@/lib/server-board-reconcile";
import {
  fetchBoardEtagFromServer,
  fetchBoardFromServer,
  getLastKnownEtag,
  getLastSyncedBoardJson,
  isServerBoardDirty,
  markServerBoardSynced,
  shouldSuppressExternalServerPoll,
} from "@/lib/server-board";
import {
  boardJsonFromTaskTreeStore,
  saveServerBoardToVault,
  setServerBoardSaveCallbacks,
} from "@/lib/server-board-save";
import { isBrowserNetworkOnline } from "@/lib/server-board-network";
import { boardExportTextsEquivalent } from "@/lib/task-tree-json";
import { useTaskTreeStore } from "@/store/task-tree-store";

const AUTO_SAVE_DEBOUNCE_MS = 700;
const EXTERNAL_POLL_MS = 5000;

export interface ServerBoardSyncProps {
  enabled: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onSavingChange?: (saving: boolean) => void;
  onConnectFailed?: () => void;
  onNetworkUnavailable?: () => void;
  onSaveError?: (message: string | null) => void;
}

export function ServerBoardSync({
  enabled,
  onDirtyChange,
  onSavingChange,
  onConnectFailed,
  onNetworkUnavailable,
  onSaveError,
}: ServerBoardSyncProps) {
  const mountedRef = useRef(true);
  const loadGenerationRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef(false);
  const initialLoadDoneRef = useRef(false);

  const onDirtyChangeRef = useRef(onDirtyChange);
  const onSavingChangeRef = useRef(onSavingChange);
  const onConnectFailedRef = useRef(onConnectFailed);
  const onNetworkUnavailableRef = useRef(onNetworkUnavailable);
  const onSaveErrorRef = useRef(onSaveError);
  onDirtyChangeRef.current = onDirtyChange;
  onSavingChangeRef.current = onSavingChange;
  onConnectFailedRef.current = onConnectFailed;
  onNetworkUnavailableRef.current = onNetworkUnavailable;
  onSaveErrorRef.current = onSaveError;

  useEffect(() => {
    setServerBoardSaveCallbacks({
      onDirtyChange: (d) => onDirtyChangeRef.current?.(d),
      onSavingChange: (s) => onSavingChangeRef.current?.(s),
    });
    return () => setServerBoardSaveCallbacks({});
  }, []);

  useEffect(() => {
    if (!enabled) {
      initialLoadDoneRef.current = false;
      return;
    }

    mountedRef.current = true;
    const generation = ++loadGenerationRef.current;
    let storeUnsub: (() => void) | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;

    const syncDirty = () => {
      onDirtyChangeRef.current?.(isServerBoardDirty(boardJsonFromTaskTreeStore()));
    };

    const reportSaveResult = (result: Awaited<ReturnType<typeof saveServerBoardToVault>>) => {
      if (result.ok) {
        onSaveErrorRef.current?.(null);
        return;
      }
      onSaveErrorRef.current?.(result.error);
      if (result.offline) {
        onNetworkUnavailableRef.current?.();
      } else {
        console.error("Vault speichern:", result.error);
      }
    };

    const flushAutoSave = async () => {
      if (!enabled || saveInFlightRef.current) return;
      saveInFlightRef.current = true;
      try {
        const result = await saveServerBoardToVault();
        if (!mountedRef.current) return;
        reportSaveResult(result);
        syncDirty();
      } finally {
        saveInFlightRef.current = false;
      }
    };

    const scheduleAutoSave = () => {
      if (!enabled) return;
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
        if (!isBrowserNetworkOnline()) onNetworkUnavailableRef.current?.();
        return;
      }

      let snap;
      try {
        snap = await fetchBoardFromServer();
      } catch (e) {
        if (!isBrowserNetworkOnline()) onNetworkUnavailableRef.current?.();
        return;
      }
      if (!snap || !mountedRef.current) return;

      const currentJson = boardJsonFromTaskTreeStore();

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
        if (!mountedRef.current || generation !== loadGenerationRef.current) return;

        const localJson = boardJsonFromTaskTreeStore();
        const result = await reconcileInitialServerBoard(
          localJson,
          snap ?? { text: "", etag: null, lastModified: 0 },
        );
        if (!mountedRef.current || generation !== loadGenerationRef.current) return;

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
        syncDirty();
        if (isServerBoardDirty(boardJsonFromTaskTreeStore())) {
          await flushAutoSave();
          if (!mountedRef.current || generation !== loadGenerationRef.current) return;
          syncDirty();
        }
      } catch (e) {
        if (!mountedRef.current || generation !== loadGenerationRef.current) return;
        console.error("Vault beim Start:", e);
        onConnectFailedRef.current?.();
      }
    };

    const onPageHide = () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      void flushAutoSave();
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

      window.addEventListener("pagehide", onPageHide);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") onPageHide();
      });
    })();

    return () => {
      mountedRef.current = false;
      storeUnsub?.();
      if (pollTimer) clearInterval(pollTimer);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [enabled]);

  return null;
}

export { saveServerBoardToVault } from "@/lib/server-board-save";
