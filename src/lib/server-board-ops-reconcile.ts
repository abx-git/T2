/**
 * Abgleich über Operations-Log (zeitliche Reihenfolge aller Clients).
 */

import { mergeBoardStateFromOps, payloadToBoardJson } from "@/lib/board-ops/reconcile";
import { setApplyingRemoteBoardOps, setBoardOpRecording } from "@/lib/board-ops/record";
import { getLastKnownOpsSeq, getPendingBoardOps } from "@/lib/board-ops/queue";
import { applyBoardJsonToStore, clearOfflinePauseState, readOfflinePauseState } from "@/lib/server-board-offline";
import { fetchBoardFromServer, getLastSyncedBoardJson, markServerBoardSynced, writeBoardToServer } from "@/lib/server-board";
import { fetchBoardOpsFromServer, flushPendingBoardOps, postBoardOpsToServer } from "@/lib/server-board-ops";
import { boardExportTextsEquivalent } from "@/lib/task-tree-json";

export type OpsReconcileResult =
  | { ok: true; mergedJson: string; appliedOps: number }
  | { ok: false; reason: "unauthorized" | "fetch_failed" | "parse_error" | "write_failed" };

export function getReconcileBaseline(): { baselineJson: string; baselineSeq: number } {
  const pause = readOfflinePauseState();
  if (pause) {
    return {
      baselineJson: pause.baselineJson,
      baselineSeq: pause.baselineSeq ?? 0,
    };
  }
  return {
    baselineJson: getLastSyncedBoardJson() ?? "",
    baselineSeq: getLastKnownOpsSeq(),
  };
}

export async function reconcileServerBoardWithOps(): Promise<OpsReconcileResult> {
  const { baselineJson, baselineSeq } = getReconcileBaseline();

  let remoteOps;
  try {
    const fetched = await fetchBoardOpsFromServer(baselineSeq);
    if (!fetched) return { ok: false, reason: "unauthorized" };
    remoteOps = fetched.ops;
  } catch {
    return { ok: false, reason: "fetch_failed" };
  }

  const localPending = getPendingBoardOps();
  const mergedPayload = mergeBoardStateFromOps(baselineJson, remoteOps, localPending);
  const mergedJson = payloadToBoardJson(mergedPayload);
  const appliedOps = remoteOps.length + localPending.length;

  setBoardOpRecording(false);
  setApplyingRemoteBoardOps(true);
  try {
    if (!applyBoardJsonToStore(mergedJson)) {
      return { ok: false, reason: "parse_error" };
    }
  } finally {
    setApplyingRemoteBoardOps(false);
    setBoardOpRecording(true);
  }

  try {
    if (localPending.length) {
      await postBoardOpsToServer(localPending);
    }
    await flushPendingBoardOps();
  } catch {
    return { ok: false, reason: "write_failed" };
  }

  try {
    const remote = await fetchBoardFromServer();
    if (!remote) return { ok: false, reason: "unauthorized" };
    if (!boardExportTextsEquivalent(remote.text, mergedJson)) {
      await writeBoardToServer(mergedJson, remote.etag);
    } else {
      markServerBoardSynced(mergedJson, remote.etag);
    }
  } catch {
    return { ok: false, reason: "write_failed" };
  }

  const after = await fetchBoardFromServer();
  if (after) {
    markServerBoardSynced(
      boardExportTextsEquivalent(after.text, mergedJson) ? mergedJson : after.text,
      after.etag,
    );
  }

  clearOfflinePauseState();
  return { ok: true, mergedJson, appliedOps };
}
