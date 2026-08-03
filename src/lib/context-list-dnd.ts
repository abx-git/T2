/**
 * DnD within the context card list (reorder siblings at any depth or nest under a card).
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
  | { kind: "gap"; listParentId: string | null; insertIndex: number }
  | { kind: "nest"; targetId: string };

export const CONTEXT_GAP_PREFIX = "context-gap:";
const CONTEXT_GAP_ROOT = "__root__";

export function contextGapId(listParentId: string | null, insertIndex: number): string {
  const key = listParentId === null ? CONTEXT_GAP_ROOT : encodeURIComponent(listParentId);
  return `${CONTEXT_GAP_PREFIX}${key}|${insertIndex}`;
}

export function parseContextGapId(overId: string | number): {
  listParentId: string | null;
  insertIndex: number;
} | null {
  const s = String(overId);
  if (!s.startsWith(CONTEXT_GAP_PREFIX)) return null;
  const rest = s.slice(CONTEXT_GAP_PREFIX.length);
  const sep = rest.indexOf("|");
  if (sep === -1) return null;
  const keyStr = rest.slice(0, sep);
  const insertIndex = Number(rest.slice(sep + 1));
  if (!Number.isFinite(insertIndex)) return null;
  let listParentId: string | null;
  if (keyStr === CONTEXT_GAP_ROOT) listParentId = null;
  else {
    try {
      listParentId = decodeURIComponent(keyStr);
    } catch {
      listParentId = keyStr;
    }
  }
  return { listParentId, insertIndex };
}

function gapParentValid(
  roots: TaskNode[],
  listParentId: string | null,
  activeNode: TaskNode,
): boolean {
  if (listParentId === null) return true;
  if (listParentId === activeNode.id || subtreeContainsId(activeNode, listParentId)) return false;
  return findNodeById(roots, listParentId) !== null;
}

export function applyContextListDrop(
  roots: TaskNode[],
  _contextNodeId: string | null,
  activeId: string,
  drop: ContextListDrop,
): TaskNode[] {
  const activeNode = findNodeById(roots, activeId);
  if (!activeNode) return roots;

  if (drop.kind === "gap") {
    const { listParentId, insertIndex } = drop;
    if (!gapParentValid(roots, listParentId, activeNode)) return roots;
    const sibsBefore = getSiblingsList(roots, listParentId);
    if (insertIndex < 0 || insertIndex > sibsBefore.length) return roots;
    const insertAt = gapIndexToInsertAfterDetach(sibsBefore, activeId, insertIndex);
    const { next: r1, detached } = detachNodeById(roots, activeId);
    if (!detached) return roots;
    return insertUnderParent(r1, listParentId, insertAt, structuredClone(detached));
  }

  const targetId = drop.targetId;
  if (targetId === activeId || subtreeContainsId(activeNode, targetId)) return roots;
  if (!findNodeById(roots, targetId)) return roots;

  const { next: r1, detached } = detachNodeById(roots, activeId);
  if (!detached) return roots;
  const childCount = getSiblingsList(r1, targetId).length;
  return insertUnderParent(r1, targetId, childCount, structuredClone(detached));
}

/**
 * Fügt einen externen Knoten (z. B. aus der Zwischenablage) in die Kartenliste ein.
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
    const { listParentId, insertIndex } = drop;
    if (listParentId !== null && !findNodeById(roots, listParentId)) return roots;
    if (listParentId !== null && subtreeContainsId(clone, listParentId)) return roots;
    const sibs = getSiblingsList(roots, listParentId);
    if (insertIndex < 0 || insertIndex > sibs.length) return roots;
    const insertAt = Math.max(0, Math.min(insertIndex, sibs.length));
    return insertUnderParent(roots, listParentId, insertAt, clone);
  }

  const targetId = drop.targetId;
  if (targetId === clone.id || subtreeContainsId(clone, targetId)) return roots;
  if (!findNodeById(roots, targetId)) return roots;
  const childCount = getSiblingsList(roots, targetId).length;
  return insertUnderParent(roots, targetId, childCount, clone);
}
