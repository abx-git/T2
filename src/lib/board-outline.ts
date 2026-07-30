/**
 * Full-board outline rows for the navigation rail (all roots, not a focus subtree).
 */

import type { FocusOutlineRow } from "@/lib/focus-mode-outline";
import { isTaskMarkedDone } from "@/lib/task-tags";
import type { TaskNode } from "@/types/task-node";

export type BoardOutlineRow = FocusOutlineRow;

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
