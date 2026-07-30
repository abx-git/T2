/**
 * DnD within the context child list (reorder siblings or nest under a peer).
 */

import {
  detachNodeById,
  findNodeById,
  gapIndexToInsertAfterDetach,
  getSiblingsList,
  insertUnderParent,
  subtreeContainsId,
} from "@/lib/tree-utils";
import type { TaskNode } from "@/types/task-node";

export type ContextListDrop =
  | { kind: "gap"; insertIndex: number }
  | { kind: "nest"; targetId: string };

export const CONTEXT_GAP_PREFIX = "context-gap:";

export function contextGapId(insertIndex: number): string {
  return `${CONTEXT_GAP_PREFIX}${insertIndex}`;
}

export function parseContextGapId(overId: string | number): number | null {
  const s = String(overId);
  if (!s.startsWith(CONTEXT_GAP_PREFIX)) return null;
  const n = Number(s.slice(CONTEXT_GAP_PREFIX.length));
  return Number.isFinite(n) ? n : null;
}

export function applyContextListDrop(
  roots: TaskNode[],
  contextNodeId: string | null,
  activeId: string,
  drop: ContextListDrop,
): TaskNode[] {
  const activeNode = findNodeById(roots, activeId);
  if (!activeNode) return roots;

  if (drop.kind === "gap") {
    const sibsBefore = getSiblingsList(roots, contextNodeId);
    if (drop.insertIndex < 0 || drop.insertIndex > sibsBefore.length) return roots;
    const insertAt = gapIndexToInsertAfterDetach(sibsBefore, activeId, drop.insertIndex);
    const { next: r1, detached } = detachNodeById(roots, activeId);
    if (!detached) return roots;
    return insertUnderParent(r1, contextNodeId, insertAt, structuredClone(detached));
  }

  const targetId = drop.targetId;
  if (targetId === activeId || subtreeContainsId(activeNode, targetId)) return roots;
  if (!findNodeById(roots, targetId)) return roots;
  // Nest only onto a sibling currently shown in this context.
  const peers = getSiblingsList(roots, contextNodeId);
  if (!peers.some((p) => p.id === targetId)) return roots;

  const { next: r1, detached } = detachNodeById(roots, activeId);
  if (!detached) return roots;
  const childCount = getSiblingsList(r1, targetId).length;
  return insertUnderParent(r1, targetId, childCount, structuredClone(detached));
}
