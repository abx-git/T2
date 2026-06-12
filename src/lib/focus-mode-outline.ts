import { findNodeById, pathFromRootToNode } from "@/lib/tree-utils";
import { isTaskMarkedDone } from "@/lib/task-tags";
import type { TaskNode } from "@/types/task-node";

export interface FocusOutlineRow {
  node: TaskNode;
  /** Tiefe relativ zum Fokus-Knoten (1 = direktes Kind). */
  depth: number;
  listParentId: string;
  siblingIndex: number;
  siblingCount: number;
  isLastSibling: boolean;
}

/** Spaltenindex für Geschwisterliste unter `listParentId` (Mindmap-DnD). */
export function columnIndexForSiblingList(roots: TaskNode[], listParentId: string | null): number {
  if (listParentId === null) return 0;
  const path = pathFromRootToNode(roots, listParentId);
  return path ? path.length : 0;
}

function walkSubtree(
  nodes: TaskNode[],
  depth: number,
  listParentId: string,
  hideCompleted: boolean,
  completedTag: string,
  out: FocusOutlineRow[],
): void {
  nodes.forEach((node, siblingIndex) => {
    if (hideCompleted && isTaskMarkedDone(node, completedTag)) return;
    out.push({
      node,
      depth,
      listParentId,
      siblingIndex,
      siblingCount: nodes.length,
      isLastSibling: siblingIndex === nodes.length - 1,
    });
    if (node.children.length > 0) {
      walkSubtree(node.children, depth + 1, node.id, hideCompleted, completedTag, out);
    }
  });
}

/** Alle Nachfahren des Fokus-Knotens in Baumreihenfolge (ohne den Fokus-Knoten selbst). */
export function buildFocusOutlineRows(
  roots: TaskNode[],
  focusNodeId: string,
  hideCompleted: boolean,
  completedTag: string,
): FocusOutlineRow[] {
  const focus = findNodeById(roots, focusNodeId);
  if (!focus) return [];
  const rows: FocusOutlineRow[] = [];
  walkSubtree(focus.children, 1, focus.id, hideCompleted, completedTag, rows);
  return rows;
}

/**
 * Entfernt leere Blatt-Knoten (ohne Titel, ohne Kinder) im Fokus-Teilbaum —
 * typische UX-Platzhalter nach „Punkt hinzufügen“ ohne Speichern.
 */
export function pruneEmptyUxLeavesInFocusSubtree(
  roots: TaskNode[],
  focusNodeId: string,
): { roots: TaskNode[]; removedIds: string[] } {
  const focus = findNodeById(roots, focusNodeId);
  if (!focus) return { roots, removedIds: [] };

  const removedIds: string[] = [];

  function pruneNode(node: TaskNode): TaskNode | null {
    const children = node.children
      .map((c) => pruneNode(c))
      .filter((c): c is TaskNode => c !== null);
    const next = { ...node, children };
    if (!next.title.trim() && children.length === 0) {
      removedIds.push(node.id);
      return null;
    }
    return next;
  }

  const prunedFocus = pruneNode(focus);
  if (!prunedFocus) {
    return { roots: detachFocusRootFromTree(roots, focusNodeId), removedIds };
  }

  if (removedIds.length === 0) return { roots, removedIds: [] };

  return {
    roots: replaceNodeInTree(roots, focusNodeId, prunedFocus),
    removedIds,
  };
}

function detachFocusRootFromTree(roots: TaskNode[], focusNodeId: string): TaskNode[] {
  const out: TaskNode[] = [];
  for (const n of roots) {
    if (n.id === focusNodeId) continue;
    if (n.children.length === 0) {
      out.push(n);
      continue;
    }
    const children = detachFocusRootFromTree(n.children, focusNodeId);
    out.push(children === n.children ? n : { ...n, children });
  }
  return out;
}

function replaceNodeInTree(roots: TaskNode[], nodeId: string, replacement: TaskNode): TaskNode[] {
  return roots.map((n) => {
    if (n.id === nodeId) return replacement;
    if (n.children.length === 0) return n;
    const children = replaceNodeInTree(n.children, nodeId, replacement);
    return children === n.children ? n : { ...n, children };
  });
}

export function countFocusSubtree(
  root: TaskNode,
  completedTag: string,
): { total: number; done: number; open: number } {
  let total = 1;
  let done = isTaskMarkedDone(root, completedTag) ? 1 : 0;
  function walk(nodes: TaskNode[]) {
    for (const n of nodes) {
      total += 1;
      if (isTaskMarkedDone(n, completedTag)) done += 1;
      walk(n.children);
    }
  }
  walk(root.children);
  return { total, done, open: total - done };
}
