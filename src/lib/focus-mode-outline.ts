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

export interface BuildFocusOutlineOptions {
  /** Eingeklappte Knoten — deren Unterpunkte werden ausgeblendet. */
  collapsedIds?: ReadonlySet<string>;
}

function walkSubtree(
  nodes: TaskNode[],
  depth: number,
  listParentId: string,
  hideCompleted: boolean,
  completedTag: string,
  options: BuildFocusOutlineOptions,
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
    if (node.children.length > 0 && !options.collapsedIds?.has(node.id)) {
      walkSubtree(
        node.children,
        depth + 1,
        node.id,
        hideCompleted,
        completedTag,
        options,
        out,
      );
    }
  });
}

/** Alle Nachfahren des Fokus-Knotens in Baumreihenfolge (ohne den Fokus-Knoten selbst). */
export function buildFocusOutlineRows(
  roots: TaskNode[],
  focusNodeId: string,
  hideCompleted: boolean,
  completedTag: string,
  options: BuildFocusOutlineOptions = {},
): FocusOutlineRow[] {
  const focus = findNodeById(roots, focusNodeId);
  if (!focus) return [];
  if (options.collapsedIds?.has(focusNodeId)) return [];
  const rows: FocusOutlineRow[] = [];
  walkSubtree(focus.children, 1, focus.id, hideCompleted, completedTag, options, rows);
  return rows;
}

/** Alle Knoten-IDs im Fokus-Teilbaum (inkl. Fokus-Wurzel). */
export function collectFocusSubtreeNodeIds(root: TaskNode): string[] {
  const ids = [root.id];
  function walk(nodes: TaskNode[]) {
    for (const n of nodes) {
      ids.push(n.id);
      walk(n.children);
    }
  }
  walk(root.children);
  return ids;
}

/**
 * Setzt `collapsedIds` für den Fokus-Teilbaum nach Klick auf „Ebenen“ —
 * einmaliges Zu-/Aufklappen, kein dauerhafter Anzeige-Filter.
 * `maxDepth`: sichtbare Ebenen ab Fokus-Wurzel (1 = nur direkte Kinder); `null` = alles aufklappen.
 */
export function collapsedIdsAfterFocusDepthAction(
  currentCollapsedIds: readonly string[],
  focusRoot: TaskNode,
  maxDepth: number | null,
): string[] {
  const subtreeIds = new Set(collectFocusSubtreeNodeIds(focusRoot));
  const next = currentCollapsedIds.filter((id) => !subtreeIds.has(id));

  if (maxDepth === null) return next;

  const toCollapse: string[] = [];
  function walk(node: TaskNode, depth: number) {
    if (node.children.length === 0) return;
    if (depth >= maxDepth) {
      toCollapse.push(node.id);
      return;
    }
    for (const child of node.children) {
      walk(child, depth + 1);
    }
  }
  walk(focusRoot, 0);

  const seen = new Set(next);
  for (const id of toCollapse) {
    if (!seen.has(id)) {
      next.push(id);
      seen.add(id);
    }
  }
  return next;
}

/** Maximale Tiefe im Fokus-Teilbaum (0 = keine Unterpunkte). */
export function getFocusOutlineMaxDepth(
  roots: TaskNode[],
  focusNodeId: string,
  hideCompleted: boolean,
  completedTag: string,
): number {
  const rows = buildFocusOutlineRows(roots, focusNodeId, hideCompleted, completedTag);
  return rows.reduce((max, row) => Math.max(max, row.depth), 0);
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
