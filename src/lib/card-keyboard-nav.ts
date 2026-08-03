import type { VisibleCardEntry } from "@/lib/card-expand";
import { findDirectParentId, findNodeById, getSiblingsList } from "@/lib/tree-utils";
import type { TaskNode } from "@/types/task-node";

export type CardNavDirection = "up" | "down" | "left" | "right";

export type CardNavResult = {
  nextId: string | null;
  /** Drill into this node (Right on a parent, navigate mode). */
  shouldDrillIn?: boolean;
  /** Leave context to parent (Left). */
  shouldDrillUp?: boolean;
  /** Expand collapsed parent (expand mode, Right). */
  shouldExpand?: boolean;
  /** Collapse expanded parent (expand mode, Left). */
  shouldCollapse?: boolean;
};

export function shouldIgnoreCardKeyboard(e: KeyboardEvent): boolean {
  const target = e.target;
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function firstContextCardId(nodes: ReadonlyArray<TaskNode>): string | null {
  return nodes[0]?.id ?? null;
}

/**
 * Navigation in the context child list (navigate mode).
 * Up/Down = siblings; Right = drill into focused card; Left = drill up.
 */
export function navigateContextCard(
  siblings: ReadonlyArray<TaskNode>,
  currentId: string,
  direction: CardNavDirection,
): CardNavResult {
  const idx = siblings.findIndex((n) => n.id === currentId);
  if (idx < 0) return { nextId: null };

  if (direction === "up") {
    return { nextId: idx > 0 ? siblings[idx - 1].id : null };
  }
  if (direction === "down") {
    return { nextId: idx < siblings.length - 1 ? siblings[idx + 1].id : null };
  }
  if (direction === "left") {
    return { nextId: null, shouldDrillUp: true };
  }
  const node = siblings[idx];
  if (node.children.length === 0) return { nextId: null };
  return { nextId: node.id, shouldDrillIn: true };
}

/**
 * Navigation over a flattened expand-mode card list.
 * Up/Down = visible rows; Right = expand or enter first child; Left = collapse or parent / drill up.
 */
export function navigateExpandedCard(
  visible: ReadonlyArray<VisibleCardEntry>,
  collapsedIds: ReadonlySet<string>,
  currentId: string,
  direction: CardNavDirection,
): CardNavResult {
  const idx = visible.findIndex((row) => row.node.id === currentId);
  if (idx < 0) return { nextId: null };

  if (direction === "up") {
    return { nextId: idx > 0 ? visible[idx - 1].node.id : null };
  }
  if (direction === "down") {
    return { nextId: idx < visible.length - 1 ? visible[idx + 1].node.id : null };
  }

  const row = visible[idx];
  const hasChildren = row.node.children.length > 0;
  const collapsed = collapsedIds.has(row.node.id);

  if (direction === "right") {
    if (!hasChildren) return { nextId: null };
    if (collapsed) return { nextId: row.node.id, shouldExpand: true };
    const firstChild = visible[idx + 1];
    if (firstChild && firstChild.parentId === row.node.id) {
      return { nextId: firstChild.node.id };
    }
    return { nextId: null };
  }

  // left
  if (hasChildren && !collapsed) {
    return { nextId: row.node.id, shouldCollapse: true };
  }
  if (row.parentId) {
    return { nextId: row.parentId };
  }
  return { nextId: null, shouldDrillUp: true };
}

export function focusTargetAfterRemoving(
  roots: TaskNode[],
  removedId: string,
  preferredSiblingId?: string | null,
): string | null {
  if (preferredSiblingId && findNodeById(roots, preferredSiblingId)) {
    return preferredSiblingId;
  }
  const parentResult = findDirectParentId(roots, removedId);
  if (parentResult === undefined) return null;
  const siblings = getSiblingsList(roots, parentResult).filter((s) => s.id !== removedId);
  if (siblings.length > 0) return siblings[0].id;
  return parentResult;
}
