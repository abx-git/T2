/**
 * Full-board outline rows for the navigation rail (all roots, not a focus subtree).
 */

import { isTaskMarkedDone } from "@/lib/task-tags";
import type { TaskNode } from "@/types/task-node";

export interface OutlineRow {
  node: TaskNode;
  /** Tiefe im Board (0 = Wurzel). */
  depth: number;
  listParentId: string;
  siblingIndex: number;
  siblingCount: number;
  isLastSibling: boolean;
}

export type BoardOutlineRow = OutlineRow;

/** Vertikale Hilfslinien-Spalten für die Baum-Darstellung in der Outline. */
export function computeOutlineRowTreeGuides(
  row: OutlineRow,
  rowsById: ReadonlyMap<string, OutlineRow>,
): boolean[] {
  if (row.depth <= 1) return [];

  const ancestors: OutlineRow[] = [];
  let current: OutlineRow | undefined = row;
  while (current && current.depth > 1) {
    const parent = rowsById.get(current.listParentId);
    if (!parent) break;
    ancestors.unshift(parent);
    current = parent;
  }

  return ancestors.slice(0, -1).map((ancestor) => !ancestor.isLastSibling);
}

function walkForest(
  nodes: TaskNode[],
  depth: number,
  listParentId: string | null,
  hideCompleted: boolean,
  completedTag: string,
  collapsedIds: ReadonlySet<string>,
  out: BoardOutlineRow[],
): void {
  const visible = hideCompleted
    ? nodes.filter((n) => !isTaskMarkedDone(n, completedTag))
    : nodes;
  visible.forEach((node, siblingIndex) => {
    out.push({
      node,
      depth,
      listParentId: listParentId ?? "",
      siblingIndex,
      siblingCount: visible.length,
      isLastSibling: siblingIndex === visible.length - 1,
    });
    if (node.children.length > 0 && !collapsedIds.has(node.id)) {
      walkForest(
        node.children,
        depth + 1,
        node.id,
        hideCompleted,
        completedTag,
        collapsedIds,
        out,
      );
    }
  });
}

/** Flattened outline of the whole board forest (depth 0 = roots). */
export function buildBoardOutlineRows(
  roots: TaskNode[],
  hideCompleted: boolean,
  completedTag: string,
  collapsedIds: ReadonlySet<string> = new Set(),
): BoardOutlineRow[] {
  const rows: BoardOutlineRow[] = [];
  walkForest(roots, 0, null, hideCompleted, completedTag, collapsedIds, rows);
  return rows;
}

export function getBoardOutlineMaxDepth(
  roots: TaskNode[],
  hideCompleted: boolean,
  completedTag: string,
): number {
  const rows = buildBoardOutlineRows(roots, hideCompleted, completedTag);
  if (rows.length === 0) return 0;
  return rows.reduce((max, row) => Math.max(max, row.depth), 0);
}
