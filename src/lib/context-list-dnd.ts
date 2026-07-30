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

/**
 * Fügt einen externen Knoten (z. B. aus der Zwischenablage) in die aktuelle Kontext-Liste ein.
 */
export function insertNodeIntoContextList(
  roots: TaskNode[],
  contextNodeId: string | null,
  insert: TaskNode,
  drop: ContextListDrop,
): TaskNode[] {
  const clone = structuredClone(insert) as TaskNode;
  if (contextNodeId !== null) {
    if (!findNodeById(roots, contextNodeId)) return roots;
    if (subtreeContainsId(clone, contextNodeId)) return roots;
  }

  if (drop.kind === "gap") {
    const sibs = getSiblingsList(roots, contextNodeId);
    if (drop.insertIndex < 0 || drop.insertIndex > sibs.length) return roots;
    const insertAt = Math.max(0, Math.min(drop.insertIndex, sibs.length));
    return insertUnderParent(roots, contextNodeId, insertAt, clone);
  }

  const targetId = drop.targetId;
  if (targetId === clone.id || subtreeContainsId(clone, targetId)) return roots;
  if (!findNodeById(roots, targetId)) return roots;
  const peers = getSiblingsList(roots, contextNodeId);
  if (!peers.some((p) => p.id === targetId)) return roots;
  const childCount = getSiblingsList(roots, targetId).length;
  return insertUnderParent(roots, targetId, childCount, clone);
}
