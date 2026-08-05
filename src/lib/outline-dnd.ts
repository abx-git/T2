/**
 * DnD in the structure outline: reorder among siblings or nest under any node.
 */

import {
  detachNodeById,
  findDirectParentId,
  findNodeById,
  gapIndexToInsertAfterDetach,
  getSiblingsList,
  insertUnderParent,
  subtreeContainsId,
} from "@/lib/tree-utils";
import type { TaskNode } from "@/types/task-node";

export type OutlineDrop =
  | { kind: "gap"; listParentId: string | null; beforeId: string | null }
  | { kind: "nest"; targetId: string };

export const OUTLINE_DRAG_PREFIX = "outline:";
export const OUTLINE_GAP_PREFIX = "outline-gap:";
export const OUTLINE_NEST_PREFIX = "outline-nest:";

const GAP_PARENT_ROOT = "__root__";
const GAP_BEFORE_END = "__end__";

/** Draggable-ID für Outline-Zeilen (vermeidet Kollision mit Kontext-Karten). */
export function outlineDragId(nodeId: string): string {
  return `${OUTLINE_DRAG_PREFIX}${nodeId}`;
}

export function parseOutlineDragId(activeId: string | number): string | null {
  const s = String(activeId);
  if (!s.startsWith(OUTLINE_DRAG_PREFIX)) return null;
  const id = s.slice(OUTLINE_DRAG_PREFIX.length);
  return id || null;
}

/** Board-Knoten-ID aus Kontext- oder Outline-Drag. */
export function boardNodeIdFromDragActive(activeId: string | number): string | null {
  const s = String(activeId);
  const fromOutline = parseOutlineDragId(s);
  if (fromOutline) return fromOutline;
  // Lazy import avoided: context card ids use pane:…:context-card:… or legacy bare id.
  const paneMatch = /^pane:(?:left|right):context-card:(.+)$/.exec(s);
  if (paneMatch?.[1]) return paneMatch[1];
  const bareCard = /^context-card:(.+)$/.exec(s);
  if (bareCard?.[1]) return bareCard[1];
  return s;
}

export function outlineNestId(nodeId: string): string {
  return `${OUTLINE_NEST_PREFIX}${nodeId}`;
}

export function parseOutlineNestId(overId: string | number): string | null {
  const s = String(overId);
  if (!s.startsWith(OUTLINE_NEST_PREFIX)) return null;
  const id = s.slice(OUTLINE_NEST_PREFIX.length);
  return id || null;
}

export function outlineGapId(listParentId: string | null, beforeId: string | null): string {
  const parentKey = listParentId === null ? GAP_PARENT_ROOT : encodeURIComponent(listParentId);
  const beforeKey = beforeId === null ? GAP_BEFORE_END : encodeURIComponent(beforeId);
  return `${OUTLINE_GAP_PREFIX}${parentKey}|${beforeKey}`;
}

export function parseOutlineGapId(overId: string | number): {
  listParentId: string | null;
  beforeId: string | null;
} | null {
  const s = String(overId);
  if (!s.startsWith(OUTLINE_GAP_PREFIX)) return null;
  const rest = s.slice(OUTLINE_GAP_PREFIX.length);
  const sep = rest.indexOf("|");
  if (sep === -1) return null;
  const parentKey = rest.slice(0, sep);
  const beforeKey = rest.slice(sep + 1);

  let listParentId: string | null;
  if (parentKey === GAP_PARENT_ROOT) listParentId = null;
  else {
    try {
      listParentId = decodeURIComponent(parentKey);
    } catch {
      listParentId = parentKey;
    }
  }

  let beforeId: string | null;
  if (beforeKey === GAP_BEFORE_END) beforeId = null;
  else {
    try {
      beforeId = decodeURIComponent(beforeKey);
    } catch {
      beforeId = beforeKey;
    }
  }

  return { listParentId, beforeId };
}

export function outlineDropFromOverId(overId: string | number): OutlineDrop | null {
  const gap = parseOutlineGapId(overId);
  if (gap) return { kind: "gap", ...gap };
  const nestId = parseOutlineNestId(overId);
  if (nestId) return { kind: "nest", targetId: nestId };
  return null;
}

function insertIndexForBeforeId(
  siblings: TaskNode[],
  beforeId: string | null,
): number | null {
  if (beforeId === null) return siblings.length;
  const idx = siblings.findIndex((n) => n.id === beforeId);
  return idx >= 0 ? idx : null;
}

export function applyOutlineDrop(
  roots: TaskNode[],
  activeId: string,
  drop: OutlineDrop,
): TaskNode[] {
  const activeNode = findNodeById(roots, activeId);
  if (!activeNode) return roots;

  if (drop.kind === "gap") {
    const { listParentId, beforeId } = drop;
    if (listParentId !== null) {
      if (listParentId === activeId || subtreeContainsId(activeNode, listParentId)) return roots;
      if (!findNodeById(roots, listParentId)) return roots;
    }
    if (beforeId === activeId) return roots;
    if (beforeId !== null && !findNodeById(roots, beforeId)) return roots;
    if (beforeId !== null) {
      const beforeParent = findDirectParentId(roots, beforeId);
      if (beforeParent === undefined) return roots;
      if (beforeParent !== listParentId) return roots;
    }

    const sibsBefore = getSiblingsList(roots, listParentId);
    const rawIndex = insertIndexForBeforeId(sibsBefore, beforeId);
    if (rawIndex === null) return roots;
    const insertAt = gapIndexToInsertAfterDetach(sibsBefore, activeId, rawIndex);
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

/** Externen Knoten (Zwischenablage) in die Outline-Struktur einfügen. */
export function insertNodeIntoOutline(
  roots: TaskNode[],
  insert: TaskNode,
  drop: OutlineDrop,
): TaskNode[] {
  const clone = structuredClone(insert) as TaskNode;

  if (drop.kind === "gap") {
    const { listParentId, beforeId } = drop;
    if (listParentId !== null) {
      if (listParentId === clone.id || subtreeContainsId(clone, listParentId)) return roots;
      if (!findNodeById(roots, listParentId)) return roots;
    }
    if (beforeId !== null && !findNodeById(roots, beforeId)) return roots;
    if (beforeId !== null) {
      const beforeParent = findDirectParentId(roots, beforeId);
      if (beforeParent === undefined || beforeParent !== listParentId) return roots;
    }
    const sibs = getSiblingsList(roots, listParentId);
    const rawIndex = insertIndexForBeforeId(sibs, beforeId);
    if (rawIndex === null) return roots;
    return insertUnderParent(roots, listParentId, rawIndex, clone);
  }

  const targetId = drop.targetId;
  if (targetId === clone.id || subtreeContainsId(clone, targetId)) return roots;
  if (!findNodeById(roots, targetId)) return roots;
  const childCount = getSiblingsList(roots, targetId).length;
  return insertUnderParent(roots, targetId, childCount, clone);
}
