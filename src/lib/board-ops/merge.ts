import type { ClientBoardOp, StoredBoardOp } from "./types";

export type MergeableOp = ClientBoardOp | StoredBoardOp;

function opSortKey(op: MergeableOp): [number, string, string] {
  const t = Date.parse(op.at);
  return [Number.isFinite(t) ? t : 0, op.clientId, op.opId];
}

/** Alle Ops chronologisch (Zeit, dann clientId, dann opId); Duplikate per opId entfernen. */
export function mergeOpsChronologically(...groups: MergeableOp[][]): MergeableOp[] {
  const byId = new Map<string, MergeableOp>();
  for (const group of groups) {
    for (const op of group) {
      byId.set(op.opId, op);
    }
  }
  return [...byId.values()].sort((a, b) => {
    const ka = opSortKey(a);
    const kb = opSortKey(b);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    if (ka[1] !== kb[1]) return ka[1].localeCompare(kb[1]);
    return ka[2].localeCompare(kb[2]);
  });
}

export function opsAfterSeq(ops: StoredBoardOp[], afterSeq: number): StoredBoardOp[] {
  return ops.filter((o) => o.seq > afterSeq);
}

export function maxSeq(ops: StoredBoardOp[]): number {
  let m = 0;
  for (const o of ops) {
    if (o.seq > m) m = o.seq;
  }
  return m;
}
