const appliedOpIds = new Set<string>();

export function markBoardOpsApplied(ops: { opId: string }[]): void {
  for (const op of ops) appliedOpIds.add(op.opId);
}

export function filterUnappliedBoardOps<T extends { opId: string }>(ops: T[]): T[] {
  return ops.filter((o) => !appliedOpIds.has(o.opId));
}

export function resetAppliedBoardOpsTracking(): void {
  appliedOpIds.clear();
}
