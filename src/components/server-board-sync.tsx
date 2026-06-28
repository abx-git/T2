"use client";

import { useEffect, useRef } from "react";

import { applyBoardJsonToStore } from "@/lib/server-board-offline";
import { reconcileInitialServerBoard } from "@/lib/server-board-reconcile";
import {
  consumePendingVaultLinkIntent,
  fetchBoardEtagFromServer,
  fetchBoardFromServer,
  getLastKnownEtag,
  getLastSyncedBoardJson,
  isBoardFetchOk,
  isServerBoardDirty,
  markServerBoardSynced,
  shouldSuppressExternalServerPoll,
  VaultDecryptError,
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
  vaultLoxId: string | null;
  onDirtyChange?: (dirty: boolean) => void;
  onSavingChange?: (saving: boolean) => void;
  onConnectFailed?: () => void;
  onNetworkUnavailable?: () => void;
  onSaveError?: (message: string | null) => void;
}

export function ServerBoardSync({
  enabled,
  vaultLoxId,
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
      if (!isBoardFetchOk(snap) || !mountedRef.current) return;

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
        const remote = await fetchBoardFromServer();
        if (!mountedRef.current || generation !== loadGenerationRef.current) return;

        const localJson = boardJsonFromTaskTreeStore();
        const linkIntent = consumePendingVaultLinkIntent();
        const result = await reconcileInitialServerBoard(localJson, remote, linkIntent);
        if (!mountedRef.current || generation !== loadGenerationRef.current) return;

        if (!result.ok) {
          if (result.reason === "cancelled") {
            window.alert("Server-Verknüpfung nicht hergestellt — Abgleich abgebrochen.");
          } else if (result.reason === "not_found") {
            window.alert(
              "Zu dieser LOX-ID liegt auf dem Server noch kein Board.\n\nAuf dem ersten Gerät „Neues Board“ wählen und speichern — oder die vollständige LOX-ID prüfen (BRD-XXXX-XXXX, unter „Daten“ → „ID kopieren“).",
            );
          } else if (result.reason === "unauthorized") {
            window.alert(
              "Zugriff mit dieser LOX-ID verweigert.\n\nBitte die vollständige Board-LOX-ID eingeben (Format BRD-XXXX-XXXX) — eine gekürzte Anzeige reicht nicht.",
            );
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
        if (e instanceof VaultDecryptError) {
          window.alert("Entschlüsselung fehlgeschlagen — LOX-ID prüfen.");
        } else {
          console.error("Vault beim Start:", e);
        }
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
  }, [enabled, vaultLoxId]);

  return null;
}

export { saveServerBoardToVault } from "@/lib/server-board-save";
