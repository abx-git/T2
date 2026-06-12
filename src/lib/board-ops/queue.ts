import type { ClientBoardOp } from "./types";

const STORAGE_KEY = "t2-board-ops-pending-v1";

export interface OpsClientStorageV1 {
  version: 1;
  lastKnownSeq: number;
  pending: ClientBoardOp[];
}

export function readOpsClientStorage(): OpsClientStorageV1 {
  if (typeof window === "undefined") {
    return { version: 1, lastKnownSeq: 0, pending: [] };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, lastKnownSeq: 0, pending: [] };
    const parsed = JSON.parse(raw) as OpsClientStorageV1;
    if (parsed?.version !== 1 || !Array.isArray(parsed.pending)) {
      return { version: 1, lastKnownSeq: 0, pending: [] };
    }
    return {
      version: 1,
      lastKnownSeq: typeof parsed.lastKnownSeq === "number" ? parsed.lastKnownSeq : 0,
      pending: parsed.pending,
    };
  } catch {
    return { version: 1, lastKnownSeq: 0, pending: [] };
  }
}

export function writeOpsClientStorage(state: OpsClientStorageV1): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function getLastKnownOpsSeq(): number {
  return readOpsClientStorage().lastKnownSeq;
}

export function setLastKnownOpsSeq(seq: number): void {
  const s = readOpsClientStorage();
  writeOpsClientStorage({ ...s, lastKnownSeq: seq });
}

export function getPendingBoardOps(): ClientBoardOp[] {
  return readOpsClientStorage().pending;
}

export function enqueueBoardOp(op: ClientBoardOp): void {
  const s = readOpsClientStorage();
  if (s.pending.some((p) => p.opId === op.opId)) return;
  writeOpsClientStorage({ ...s, pending: [...s.pending, op] });
}

export function removePendingOpsById(opIds: string[]): void {
  if (!opIds.length) return;
  const drop = new Set(opIds);
  const s = readOpsClientStorage();
  writeOpsClientStorage({ ...s, pending: s.pending.filter((p) => !drop.has(p.opId)) });
}

export function clearPendingBoardOps(): void {
  const s = readOpsClientStorage();
  writeOpsClientStorage({ ...s, pending: [] });
}
