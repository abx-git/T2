/**
 * DnD within the context card list (reorder siblings at any depth or nest under a card).
 */

import {
  parseContextPanePrefixedId,
  stripContextPanePrefix,
  withContextPanePrefix,
  type BoardPaneId,
} from "@/lib/board-pane";
import { applyMergeIntoNote, mergeExternalNodeIntoNote } from "@/lib/note-merge";
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
export const CONTEXT_CARD_PREFIX = "context-card:";
export const CONTEXT_NEST_PREFIX = "context-nest:";
const CONTEXT_GAP_ROOT = "__root__";

function bareContextGapId(listParentId: string | null, insertIndex: number): string {
  const key = listParentId === null ? CONTEXT_GAP_ROOT : encodeURIComponent(listParentId);
  return `${CONTEXT_GAP_PREFIX}${key}|${insertIndex}`;
}

/** Gap droppable id; pass `pane` when rendering dual panes. */
export function contextGapId(
  listParentId: string | null,
  insertIndex: number,
  pane?: BoardPaneId,
): string {
  const bare = bareContextGapId(listParentId, insertIndex);
  return pane ? withContextPanePrefix(pane, bare) : bare;
}

export function parseContextGapId(overId: string | number): {
  listParentId: string | null;
  insertIndex: number;
} | null {
  const bare = stripContextPanePrefix(overId);
  if (!bare.startsWith(CONTEXT_GAP_PREFIX)) return null;
  const rest = bare.slice(CONTEXT_GAP_PREFIX.length);
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

export function contextCardDragId(pane: BoardPaneId, nodeId: string): string {
  return withContextPanePrefix(pane, `${CONTEXT_CARD_PREFIX}${nodeId}`);
}

export function parseContextCardDragId(activeId: string | number): string | null {
  const bare = stripContextPanePrefix(activeId);
  if (!bare.startsWith(CONTEXT_CARD_PREFIX)) return null;
  const id = bare.slice(CONTEXT_CARD_PREFIX.length);
  return id || null;
}

export function contextNestDropId(pane: BoardPaneId, nodeId: string): string {
  return withContextPanePrefix(pane, `${CONTEXT_NEST_PREFIX}${nodeId}`);
}

export function parseContextNestDropId(overId: string | number): string | null {
  const bare = stripContextPanePrefix(overId);
  if (!bare.startsWith(CONTEXT_NEST_PREFIX)) return null;
  const id = bare.slice(CONTEXT_NEST_PREFIX.length);
  return id || null;
}

/** True if id is a context gap (with or without pane prefix). */
export function isContextGapDroppableId(id: string | number): boolean {
  return stripContextPanePrefix(id).startsWith(CONTEXT_GAP_PREFIX);
}

export function contextPaneFromDroppableId(id: string | number): BoardPaneId | null {
  return parseContextPanePrefixedId(id)?.pane ?? null;
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

  const merged = applyMergeIntoNote(roots, activeId, targetId);
  if (merged !== null) return merged;

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

  const merged = mergeExternalNodeIntoNote(roots, clone, targetId);
  if (merged !== null) return merged;

  const childCount = getSiblingsList(roots, targetId).length;
  return insertUnderParent(roots, targetId, childCount, clone);
}
