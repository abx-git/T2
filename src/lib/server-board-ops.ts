/**
 * Client-Helfer für das Board-Operations-Log (Multi-Client-Zusammenführung).
 */

import type { ClientBoardOp, StoredBoardOp } from "@/lib/board-ops/types";
import {
  getPendingBoardOps,
  removePendingOpsById,
  setLastKnownOpsSeq,
} from "@/lib/board-ops/queue";

export interface BoardOpsFetchResult {
  headSeq: number;
  ops: StoredBoardOp[];
}

export async function fetchBoardOpsFromServer(afterSeq: number): Promise<BoardOpsFetchResult | null> {
  const res = await fetch(`/api/board/ops?after=${afterSeq}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Board-Ops laden fehlgeschlagen (${res.status}).`);
  return (await res.json()) as BoardOpsFetchResult;
}

export async function postBoardOpsToServer(ops: ClientBoardOp[]): Promise<{
  headSeq: number;
  stored: StoredBoardOp[];
} | null> {
  if (!ops.length) {
    const current = await fetchBoardOpsFromServer(0);
    return current ? { headSeq: current.headSeq, stored: [] } : null;
  }
  const res = await fetch("/api/board/ops", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ops }),
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Board-Ops senden fehlgeschlagen (${res.status}).`);
  const data = (await res.json()) as { headSeq: number; stored: StoredBoardOp[] };
  const ids = data.stored.map((s) => s.opId);
  removePendingOpsById(ids);
  setLastKnownOpsSeq(data.headSeq);
  return data;
}

export async function flushPendingBoardOps(): Promise<number> {
  const pending = getPendingBoardOps();
  if (!pending.length) return 0;
  const result = await postBoardOpsToServer(pending);
  if (!result) return 0;
  return result.stored.length;
}
