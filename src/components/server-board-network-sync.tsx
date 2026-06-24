"use client";

import { useEffect, useRef } from "react";

import { isAutoPausedOffline, readOfflinePauseState } from "@/lib/server-board-offline";
import { isBrowserNetworkOnline, subscribeNetworkStatus } from "@/lib/server-board-network";

export interface ServerBoardNetworkSyncProps {
  serverBoardEnabled: boolean;
  vaultLinked: boolean;
  /** Netz weg oder Speichern nicht erreichbar — Offline-Entwurf anlegen. */
  onAutoOffline: () => void;
  /** Nach Netz-Wiederkehr (nur bei autoPaused) Server wieder verbinden. */
  onAutoReconnect: () => void;
  onAutoPausedChange?: (autoPaused: boolean) => void;
}

/**
 * Reagiert auf offline/online und stellt nach Reload bei autoPaused + Netz den Server-Link wieder her.
 */
export function ServerBoardNetworkSync({
  serverBoardEnabled,
  vaultLinked,
  onAutoOffline,
  onAutoReconnect,
  onAutoPausedChange,
}: ServerBoardNetworkSyncProps) {
  const onAutoOfflineRef = useRef(onAutoOffline);
  const onAutoReconnectRef = useRef(onAutoReconnect);
  const onAutoPausedChangeRef = useRef(onAutoPausedChange);
  onAutoOfflineRef.current = onAutoOffline;
  onAutoReconnectRef.current = onAutoReconnect;
  onAutoPausedChangeRef.current = onAutoPausedChange;

  const serverBoardEnabledRef = useRef(serverBoardEnabled);
  serverBoardEnabledRef.current = serverBoardEnabled;

  const vaultLinkedRef = useRef(vaultLinked);
  vaultLinkedRef.current = vaultLinked;

  useEffect(() => {
    onAutoPausedChangeRef.current?.(isAutoPausedOffline());
  }, [serverBoardEnabled, vaultLinked]);

  useEffect(() => {
    const tryReconnect = () => {
      if (!vaultLinkedRef.current || serverBoardEnabledRef.current) return;
      const pause = readOfflinePauseState();
      if (!pause?.autoPaused || !isBrowserNetworkOnline()) return;
      onAutoReconnectRef.current();
    };

    tryReconnect();

    return subscribeNetworkStatus((online) => {
      onAutoPausedChangeRef.current?.(isAutoPausedOffline());
      if (!online) {
        if (serverBoardEnabledRef.current && vaultLinkedRef.current) {
          onAutoOfflineRef.current();
        }
        return;
      }
      tryReconnect();
    });
  }, []);

  return null;
}
