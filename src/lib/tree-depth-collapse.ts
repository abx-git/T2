import type { TaskNode } from "@/types/task-node";

/** Alle Knoten-IDs im Baum (Wurzeln des Boards). */
export function collectAllTreeNodeIds(roots: TaskNode[]): string[] {
  const ids: string[] = [];
  function walk(nodes: TaskNode[]) {
    for (const n of nodes) {
      ids.push(n.id);
      walk(n.children);
    }
  }
  walk(roots);
  return ids;
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
 * Maximale sichtbare Ebenen in der Hauptansicht (1 = nur Spalte 0 / Wurzelebene).
 */
export function getBoardMaxVisibleLevels(roots: TaskNode[]): number {
  let maxDepth = 0;
  function walk(nodes: TaskNode[], depth: number) {
    for (const n of nodes) {
      maxDepth = Math.max(maxDepth, depth);
      walk(n.children, depth + 1);
    }
  }
  walk(roots, 0);
  return maxDepth + 1;
}

function mergeCollapsedIds(
  currentCollapsedIds: readonly string[],
  scopeIds: ReadonlySet<string>,
  toCollapse: string[],
): string[] {
  const next = currentCollapsedIds.filter((id) => !scopeIds.has(id));
  const seen = new Set(next);
  for (const id of toCollapse) {
    if (!seen.has(id)) {
      next.push(id);
      seen.add(id);
    }
  }
  return next;
}

/**
 * Hauptansicht: `visibleLevels` 1 = nur Wurzelebene; `null` = alles aufklappen.
 * Einmalige Aktion — danach steuern Chevron-Buttons pro Karte.
 */
export function collapsedIdsAfterBoardDepthAction(
  currentCollapsedIds: readonly string[],
  roots: TaskNode[],
  visibleLevels: number | null,
): string[] {
  const treeIds = new Set(collectAllTreeNodeIds(roots));
  if (visibleLevels === null) {
    return currentCollapsedIds.filter((id) => !treeIds.has(id));
  }

  const collapseFromDepth = visibleLevels - 1;
  const toCollapse: string[] = [];

  function walk(nodes: TaskNode[], depth: number) {
    for (const n of nodes) {
      if (n.children.length === 0) continue;
      if (depth >= collapseFromDepth) {
        toCollapse.push(n.id);
        continue;
      }
      walk(n.children, depth + 1);
    }
  }
  walk(roots, 0);

  return mergeCollapsedIds(currentCollapsedIds, treeIds, toCollapse);
}

/**
 * Fokus-Ansicht: `maxDepth` 1 = direkte Kinder sichtbar; `null` = alles aufklappen.
 */
export function collapsedIdsAfterFocusDepthAction(
  currentCollapsedIds: readonly string[],
  focusRoot: TaskNode,
  maxDepth: number | null,
): string[] {
  const subtreeIds = new Set(collectFocusSubtreeNodeIds(focusRoot));
  if (maxDepth === null) {
    return currentCollapsedIds.filter((id) => !subtreeIds.has(id));
  }

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

  return mergeCollapsedIds(currentCollapsedIds, subtreeIds, toCollapse);
}

/** Standard beim ersten Laden: nur oberste Ebene (Wurzelkarten). */
export function defaultBoardCollapsedIds(roots: TaskNode[]): string[] {
  if (roots.length === 0 || getBoardMaxVisibleLevels(roots) <= 1) return [];
  return collapsedIdsAfterBoardDepthAction([], roots, 1);
}
