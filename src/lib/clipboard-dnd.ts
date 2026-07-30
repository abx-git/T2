import type { TaskNode } from "@/types/task-node";

import {
  detachNodeById,
  findNodeById,
  gapIndexToInsertAfterDetach,
  getSiblingsList,
  insertUnderParent,
  subtreeContainsId,
} from "./tree-utils";

export const CLIPBOARD_DROP_TARGET_ID = "clipboard-drop-target";
/** Gesamte geöffnete Seitenleiste als Drop-Fläche (zusätzlich zum Header-Button). */
export const CLIPBOARD_SIDEBAR_DROP_ID = "clipboard-sidebar-drop";
export const CLIPBOARD_GAP_PREFIX = "clipboard-gap:";

const CLIPBOARD_GAP_ROOT = "__root__";

export function clipboardGapId(listParentId: string | null, insertIndex: number): string {
  const key = listParentId === null ? CLIPBOARD_GAP_ROOT : encodeURIComponent(listParentId);
  return `${CLIPBOARD_GAP_PREFIX}${key}|${insertIndex}`;
}

export function parseClipboardGapId(overId: string | number): {
  listParentId: string | null;
  insertIndex: number;
} | null {
  const s = String(overId);
  if (!s.startsWith(CLIPBOARD_GAP_PREFIX)) return null;
  const rest = s.slice(CLIPBOARD_GAP_PREFIX.length);
  const sep = rest.indexOf("|");
  if (sep === -1) return null;
  const keyStr = rest.slice(0, sep);
  const insertIndex = Number(rest.slice(sep + 1));
  if (!Number.isFinite(insertIndex)) return null;
  let listParentId: string | null;
  if (keyStr === CLIPBOARD_GAP_ROOT) listParentId = null;
  else {
    try {
      listParentId = decodeURIComponent(keyStr);
    } catch {
      listParentId = keyStr;
    }
  }
  return { listParentId, insertIndex };
}

export type ForestDropTarget =
  | { kind: "gap"; listParentId: string | null; insertIndex: number }
  | { kind: "nest"; targetId: string };

export type NodeForestLocation = "board" | "clipboard";

export function findNodeForestLocation(
  boardRoots: TaskNode[],
  clipboardRoots: TaskNode[],
  nodeId: string,
): NodeForestLocation | null {
  if (findNodeById(boardRoots, nodeId)) return "board";
  if (findNodeById(clipboardRoots, nodeId)) return "clipboard";
  return null;
}

function forestGapTargetValid(
  roots: TaskNode[],
  listParentId: string | null,
  activeNode: TaskNode,
): boolean {
  if (listParentId === null) return true;
  if (listParentId === activeNode.id || subtreeContainsId(activeNode, listParentId)) return false;
  return findNodeById(roots, listParentId) !== null;
}

/** Reorder / nest within a single forest (Zwischenablage intern). */
export function applyForestDrop(
  roots: TaskNode[],
  activeId: string,
  target: ForestDropTarget,
): TaskNode[] {
  const activeNode = findNodeById(roots, activeId);
  if (!activeNode) return roots;

  if (target.kind === "gap") {
    const { listParentId, insertIndex: gapIdx } = target;
    if (!forestGapTargetValid(roots, listParentId, activeNode)) return roots;
    const sibsBefore = getSiblingsList(roots, listParentId);
    if (gapIdx < 0 || gapIdx > sibsBefore.length) return roots;
    const insertAt = gapIndexToInsertAfterDetach(sibsBefore, activeId, gapIdx);
    const { next: r1, detached } = detachNodeById(roots, activeId);
    if (!detached) return roots;
    return insertUnderParent(r1, listParentId, insertAt, structuredClone(detached));
  }

  const targetId = target.targetId;
  if (targetId === activeId || subtreeContainsId(activeNode, targetId)) return roots;
  if (!findNodeById(roots, targetId)) return roots;
  const { next: r1, detached } = detachNodeById(roots, activeId);
  if (!detached) return roots;
  const clone = structuredClone(detached) as TaskNode;
  const childCount = getSiblingsList(r1, targetId).length;
  return insertUnderParent(r1, targetId, childCount, clone);
}

export function insertIntoForest(
  roots: TaskNode[],
  node: TaskNode,
  target?: ForestDropTarget,
): TaskNode[] {
  const clone = structuredClone(node) as TaskNode;
  if (!target) return [...roots, clone];
  if (target.kind === "gap") {
    const { listParentId, insertIndex: gapIdx } = target;
    const sibs = getSiblingsList(roots, listParentId);
    if (gapIdx < 0 || gapIdx > sibs.length) return [...roots, clone];
    if (listParentId !== null && !findNodeById(roots, listParentId)) return [...roots, clone];
    if (listParentId !== null && subtreeContainsId(clone, listParentId)) return [...roots, clone];
    const insertAt = Math.max(0, Math.min(gapIdx, sibs.length));
    return insertUnderParent(roots, listParentId, insertAt, clone);
  }
  const targetId = target.targetId;
  if (!findNodeById(roots, targetId) || subtreeContainsId(clone, targetId)) {
    return [...roots, clone];
  }
  const childCount = getSiblingsList(roots, targetId).length;
  return insertUnderParent(roots, targetId, childCount, clone);
}

export function forestDropTargetFromOverId(
  overId: string,
  forestRoots: TaskNode[],
): ForestDropTarget | null {
  const gap = parseClipboardGapId(overId);
  if (gap) return { kind: "gap", ...gap };
  if (findNodeById(forestRoots, overId)) return { kind: "nest", targetId: overId };
  return null;
}

export type UnifiedDragDrop =
  | { type: "to-clipboard-end" }
  | { type: "to-clipboard"; target: ForestDropTarget }
  | { type: "within-clipboard"; target: ForestDropTarget };

export function resolveUnifiedDragDrop(
  activeId: string,
  boardRoots: TaskNode[],
  clipboardRoots: TaskNode[],
  overId: string,
): UnifiedDragDrop | null {
  const location = findNodeForestLocation(boardRoots, clipboardRoots, activeId);

  if (overId === CLIPBOARD_DROP_TARGET_ID || overId === CLIPBOARD_SIDEBAR_DROP_ID) {
    if (location === "board") return { type: "to-clipboard-end" };
    return null;
  }

  const clipboardTarget = forestDropTargetFromOverId(overId, clipboardRoots);
  if (clipboardTarget) {
    if (location === "board") return { type: "to-clipboard", target: clipboardTarget };
    if (location === "clipboard") return { type: "within-clipboard", target: clipboardTarget };
  }

  return null;
}
