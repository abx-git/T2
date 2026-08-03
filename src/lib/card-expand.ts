import { isTaskMarkedDone } from "@/lib/task-tags";
import type { TaskNode } from "@/types/task-node";

export type CardInteractionMode = "navigate" | "expand";

export type VisibleCardEntry = {
  node: TaskNode;
  depth: number;
  parentId: string | null;
};

/**
 * Flache Liste der in der Kartenansicht sichtbaren Knoten
 * (Kontext-Kinder inkl. aufgeklappter Nachfahren).
 */
export function flattenVisibleCards(
  nodes: ReadonlyArray<TaskNode>,
  collapsedIds: ReadonlySet<string>,
  options?: { hideCompleted?: boolean; completedTag?: string },
): VisibleCardEntry[] {
  const out: VisibleCardEntry[] = [];

  function walk(list: ReadonlyArray<TaskNode>, depth: number, parentId: string | null) {
    for (const node of list) {
      if (options?.hideCompleted && options.completedTag && isTaskMarkedDone(node, options.completedTag)) {
        continue;
      }
      out.push({ node, depth, parentId });
      if (node.children.length > 0 && !collapsedIds.has(node.id)) {
        walk(node.children, depth + 1, node.id);
      }
    }
  }

  walk(nodes, 0, null);
  return out;
}

export function visibleChildrenOf(
  node: TaskNode,
  options?: { hideCompleted?: boolean; completedTag?: string },
): TaskNode[] {
  if (!options?.hideCompleted || !options.completedTag) return node.children;
  return node.children.filter((n) => !isTaskMarkedDone(n, options.completedTag!));
}
