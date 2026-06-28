/**
 * Server-Vault speichern (Auto-Save + manueller „Speichern“-Button).
 */

import { applyBoardJsonToStore } from "@/lib/server-board-offline";
import {
  boardExportTextsEquivalent,
  buildBoardSnapshot,
  stringifyExportedDocument,
} from "@/lib/task-tree-json";
import {
  fetchBoardFromServer,
  getLastKnownEtag,
  getLinkedVaultLoxId,
  isBoardFetchOk,
  isServerBoardDirty,
  markServerBoardSynced,
  writeBoardToServer,
} from "@/lib/server-board";
import { isBrowserNetworkOnline } from "@/lib/server-board-network";
import { useTaskTreeStore } from "@/store/task-tree-store";

export interface ServerBoardSaveCallbacks {
  onDirtyChange?: (dirty: boolean) => void;
  onSavingChange?: (saving: boolean) => void;
}

export type ServerBoardSaveResult =
  | { ok: true }
  | { ok: false; error: string; offline?: boolean };

let callbacks: ServerBoardSaveCallbacks = {};

export function setServerBoardSaveCallbacks(cbs: ServerBoardSaveCallbacks): void {
  callbacks = cbs;
}

export function boardJsonFromTaskTreeStore(): string {
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

function syncDirtyFlag(): void {
  callbacks.onDirtyChange?.(isServerBoardDirty(boardJsonFromTaskTreeStore()));
}

export async function saveServerBoardToVault(): Promise<ServerBoardSaveResult> {
  if (!getLinkedVaultLoxId()) {
    return { ok: false, error: "Keine LOX-ID — bitte mit dem Server verbinden." };
  }
  if (!isBrowserNetworkOnline()) {
    return { ok: false, error: "Kein Netz — Offline-Entwurf auf diesem Gerät.", offline: true };
  }

  const json = boardJsonFromTaskTreeStore();
  if (!isServerBoardDirty(json)) {
    syncDirtyFlag();
    return { ok: true };
  }

  callbacks.onSavingChange?.(true);
  try {
    const etag = getLastKnownEtag();
    await writeBoardToServer(json, etag);
    syncDirtyFlag();
    return { ok: true };
  } catch (e) {
    if (e instanceof Error && e.message === "precondition_failed") {
      try {
        const remote = await fetchBoardFromServer();
        if (!isBoardFetchOk(remote)) {
          return { ok: false, error: "Server-Version konnte nicht geladen werden." };
        }
        const localJson = boardJsonFromTaskTreeStore();
        if (boardExportTextsEquivalent(remote.text, localJson)) {
          markServerBoardSynced(localJson, remote.etag);
          await writeBoardToServer(localJson, remote.etag);
          syncDirtyFlag();
          return { ok: true };
        }
        const discard = window.confirm(
          "Ein anderes Gerät hat das Board geändert. Lokale Änderungen verwerfen und die Server-Version laden?",
        );
        if (!discard) {
          markServerBoardSynced(localJson, remote.etag);
          syncDirtyFlag();
          return { ok: false, error: "Konflikt — lokal und Server unterscheiden sich." };
        }
        applyBoardJsonToStore(remote.text);
        markServerBoardSynced(remote.text, remote.etag);
        syncDirtyFlag();
        return { ok: true };
      } catch (inner) {
        const msg = inner instanceof Error ? inner.message : "Konflikt-Auflösung fehlgeschlagen.";
        return { ok: false, error: msg };
      }
    }

    const msg = e instanceof Error ? e.message : "Speichern auf den Server ist fehlgeschlagen.";
    return { ok: false, error: msg };
  } finally {
    callbacks.onSavingChange?.(false);
  }
}
