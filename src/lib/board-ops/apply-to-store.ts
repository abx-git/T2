import { applyBoardOpsFromClient } from "@/lib/board-ops/apply";
import { boardPayloadFromExportJson, payloadToBoardJson } from "@/lib/board-ops/reconcile";
import { setApplyingRemoteBoardOps } from "@/lib/board-ops/record";
import type { StoredBoardOp } from "@/lib/board-ops/types";
import { applyBoardJsonToStore, boardJsonFromTaskTreeState } from "@/lib/server-board-offline";
import { useTaskTreeStore } from "@/store/task-tree-store";

export function applyStoredBoardOpsToStore(ops: StoredBoardOp[]): boolean {
  if (!ops.length) return true;
  const payload = boardPayloadFromExportJson(boardJsonFromTaskTreeState(useTaskTreeStore.getState()));
  const next = applyBoardOpsFromClient(payload, ops);
  setApplyingRemoteBoardOps(true);
  try {
    return applyBoardJsonToStore(payloadToBoardJson(next));
  } finally {
    setApplyingRemoteBoardOps(false);
  }
}
