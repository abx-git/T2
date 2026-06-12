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
  isBoardSnapshot,
  parseExportedDocument,
} from "@/lib/task-tree-json";
import { getPendingBoardOps } from "@/lib/board-ops/queue";
import {
  getLastSyncedBoardJson,
  markServerBoardSynced,
  writeBoardToServer,
  type BoardFetchResult,
} from "@/lib/server-board";
import { fetchBoardOpsFromServer } from "@/lib/server-board-ops";
import { getReconcileBaseline, reconcileServerBoardWithOps } from "@/lib/server-board-ops-reconcile";

export type ReconcileResult =
  | { ok: true; plan: ReconcilePlan }
  | { ok: false; reason: "parse_error" | "write_failed" | "cancelled" };

function isEmptyBoardJson(json: string): boolean {
  const payload = boardImportPayloadFromExportText(json);
  return !payload || payload.roots.length === 0;
}

async function tryOpsReconcile(): Promise<ReconcileResult | null> {
  const pause = readOfflinePauseState();
  const pending = getPendingBoardOps();
  if (!pause && pending.length === 0) {
    try {
      const { baselineSeq } = getReconcileBaseline();
      const remote = await fetchBoardOpsFromServer(baselineSeq);
      if (!remote?.ops.length) return null;
    } catch {
      return null;
    }
  }

  const result = await reconcileServerBoardWithOps();
  if (result.ok) {
    return { ok: true, plan: { action: "merge_ops", appliedOps: result.appliedOps } };
  }
  return null;
}

export async function reconcileAndApplyServerBoard(
  localJson: string,
  remote: BoardFetchResult,
): Promise<ReconcileResult> {
  const opsResult = await tryOpsReconcile();
  if (opsResult) return opsResult;

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
    const opsRetry = await tryOpsReconcile();
    if (opsRetry) return opsRetry;
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

  const opsConflict = await tryOpsReconcile();
  if (opsConflict) return opsConflict;
  return resolveConflict(localJson, remote);
}

async function resolveConflict(
  localJson: string,
  remote: BoardFetchResult,
): Promise<ReconcileResult> {
  const opsResult = await tryOpsReconcile();
  if (opsResult) return opsResult;

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
  remote: BoardFetchResult,
): Promise<ReconcileResult> {
  if (readOfflinePauseState()) {
    return reconcileAndApplyServerBoard(localJson, remote);
  }

  if (!remote.text.trim()) {
    try {
      await writeBoardToServer(localJson, remote.etag);
    } catch {
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
