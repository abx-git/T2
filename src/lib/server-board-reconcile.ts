/**
 * Abgleich lokaler und Server-Board-Stände beim Wieder-Verbinden.
 */

import {
  applyBoardJsonToStore,
  clearOfflinePauseState,
  planServerBoardReconcile,
  readOfflinePauseState,
  type ReconcilePlan,
} from "@/lib/server-board-offline";
import {
  boardExportTextsEquivalent,
  boardImportPayloadFromExportText,
} from "@/lib/task-tree-json";
import {
  getLastSyncedBoardJson,
  markServerBoardSynced,
  writeBoardToServer,
  type BoardFetchResult,
} from "@/lib/server-board";
import { VaultDecryptError } from "@/lib/vault-crypto";

export type ReconcileResult =
  | { ok: true; plan: ReconcilePlan }
  | { ok: false; reason: "parse_error" | "write_failed" | "cancelled" | "decrypt_error" };

function isEmptyBoardJson(json: string): boolean {
  const payload = boardImportPayloadFromExportText(json);
  return !payload || payload.roots.length === 0;
}

export async function reconcileAndApplyServerBoard(
  localJson: string,
  remote: BoardFetchResult,
): Promise<ReconcileResult> {
  const pause = readOfflinePauseState();
  const baselineJson = pause?.baselineJson ?? getLastSyncedBoardJson() ?? localJson;
  const plan = planServerBoardReconcile(localJson, remote.text, baselineJson);

  if (plan.action === "in_sync") {
    markServerBoardSynced(localJson, remote.etag);
    clearOfflinePauseState();
    return { ok: true, plan };
  }

  if (plan.action === "apply_remote") {
    if (remote.text.trim() && !applyBoardJsonToStore(remote.text)) {
      return { ok: false, reason: "parse_error" };
    }
    markServerBoardSynced(remote.text.trim() ? remote.text : localJson, remote.etag);
    clearOfflinePauseState();
    return { ok: true, plan };
  }

  if (plan.action === "push_local") {
    try {
      await writeBoardToServer(localJson, remote.etag);
    } catch (e) {
      if (e instanceof Error && e.message === "precondition_failed") {
        return resolveConflict(localJson, remote);
      }
      return { ok: false, reason: "write_failed" };
    }
    clearOfflinePauseState();
    return { ok: true, plan };
  }

  return resolveConflict(localJson, remote);
}

async function resolveConflict(
  localJson: string,
  remote: BoardFetchResult,
): Promise<ReconcileResult> {
  const keepLocal = window.confirm(
    "Lokal und Server unterscheiden sich.\n\nOK = Ihre lokale Version auf den Server speichern\nAbbrechen = Server-Version laden (lokale Änderungen verwerfen)",
  );

  if (keepLocal) {
    try {
      await writeBoardToServer(localJson, remote.etag);
      clearOfflinePauseState();
      return { ok: true, plan: { action: "push_local" } };
    } catch {
      return { ok: false, reason: "write_failed" };
    }
  }

  const discard = window.confirm(
    "Server-Version wirklich laden? Alle lokalen Änderungen seit dem Trennen gehen verloren.",
  );
  if (!discard) return { ok: false, reason: "cancelled" };

  if (remote.text.trim() && !applyBoardJsonToStore(remote.text)) {
    return { ok: false, reason: "parse_error" };
  }
  markServerBoardSynced(remote.text.trim() ? remote.text : localJson, remote.etag);
  clearOfflinePauseState();
  return { ok: true, plan: { action: "apply_remote" } };
}

/** Erster Connect ohne Offline-Pause. */
export async function reconcileInitialServerBoard(
  localJson: string,
  remote: BoardFetchResult | null,
): Promise<ReconcileResult> {
  if (readOfflinePauseState()) {
    if (!remote) return { ok: false, reason: "write_failed" };
    return reconcileAndApplyServerBoard(localJson, remote);
  }

  if (!remote || !remote.text.trim()) {
    try {
      await writeBoardToServer(localJson, remote?.etag ?? null);
    } catch (e) {
      if (e instanceof VaultDecryptError) return { ok: false, reason: "decrypt_error" };
      return { ok: false, reason: "write_failed" };
    }
    return { ok: true, plan: { action: "push_local" } };
  }

  if (boardExportTextsEquivalent(localJson, remote.text)) {
    markServerBoardSynced(localJson, remote.etag);
    return { ok: true, plan: { action: "in_sync" } };
  }

  if (isEmptyBoardJson(localJson)) {
    if (!applyBoardJsonToStore(remote.text)) return { ok: false, reason: "parse_error" };
    markServerBoardSynced(remote.text, remote.etag);
    return { ok: true, plan: { action: "apply_remote" } };
  }

  if (isEmptyBoardJson(remote.text)) {
    try {
      await writeBoardToServer(localJson, remote.etag);
    } catch {
      return { ok: false, reason: "write_failed" };
    }
    return { ok: true, plan: { action: "push_local" } };
  }

  const loadServer = window.confirm(
    "Der Server enthält bereits ein Board, das sich von Ihrem aktuellen Stand unterscheidet.\n\nOK = Server-Version laden\nAbbrechen = lokalen Stand auf den Server speichern",
  );

  if (loadServer) {
    if (!applyBoardJsonToStore(remote.text)) return { ok: false, reason: "parse_error" };
    markServerBoardSynced(remote.text, remote.etag);
    return { ok: true, plan: { action: "apply_remote" } };
  }

  try {
    await writeBoardToServer(localJson, remote.etag);
    return { ok: true, plan: { action: "push_local" } };
  } catch (e) {
    if (e instanceof Error && e.message === "precondition_failed") {
      return reconcileAndApplyServerBoard(localJson, remote);
    }
    return { ok: false, reason: "write_failed" };
  }
}
