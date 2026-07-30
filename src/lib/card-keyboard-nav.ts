import type { FocusOutlineRow } from "@/lib/focus-mode-outline";
import { findDirectParentId, findNodeById, getSiblingsList } from "@/lib/tree-utils";
import type { TaskNode } from "@/types/task-node";

export type CardNavDirection = "up" | "down" | "left" | "right";

export type CardNavResult = {
  nextId: string | null;
  /** Drill into this node (Right on a parent). */
  shouldDrillIn?: boolean;
  /** Leave context to parent (Left). */
  shouldDrillUp?: boolean;
  /** Outline: expand collapsed parent before entering first child. */
  shouldExpand?: boolean;
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
 * Navigation in the context child list.
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

function isVisibleOutlineNode(
  nodeId: string,
  focusRootId: string,
  rows: ReadonlyArray<FocusOutlineRow>,
  focusRootCollapsed: boolean,
): boolean {
  if (nodeId === focusRootId) return true;
  if (focusRootCollapsed) return false;
  return rows.some((row) => row.node.id === nodeId);
}

/** Baum-Navigation in einer Outline. */
export function navigateOutlineCard(
  roots: TaskNode[],
  collapsedIds: ReadonlySet<string>,
  focusRootId: string,
  rows: ReadonlyArray<FocusOutlineRow>,
  focusRootCollapsed: boolean,
  currentId: string,
  direction: CardNavDirection,
): CardNavResult {
  const node = findNodeById(roots, currentId);
  if (!node) return { nextId: null };

  if (currentId === focusRootId) {
    if (direction === "down" || direction === "right") {
      if (focusRootCollapsed && node.children.length > 0) {
        return { nextId: node.children[0].id, shouldExpand: true };
      }
      const first = rows[0];
      return first ? { nextId: first.node.id } : { nextId: null };
    }
    if (direction === "left") {
      const parent = findDirectParentId(roots, focusRootId);
      if (parent === undefined || parent === null) return { nextId: null };
      return { nextId: parent };
    }
    return { nextId: null };
  }

  const row = rows.find((r) => r.node.id === currentId);
  if (!row) return { nextId: null };

  if (direction === "right") {
    if (node.children.length === 0) return { nextId: null };
    if (collapsedIds.has(currentId)) {
      return { nextId: node.children[0].id, shouldExpand: true };
    }
    const childRow = rows.find((r) => r.listParentId === currentId);
    return childRow ? { nextId: childRow.node.id } : { nextId: null };
  }

  if (direction === "left") {
    return { nextId: row.listParentId || focusRootId };
  }

  const siblings = getSiblingsList(roots, row.listParentId || null).filter((s) =>
    isVisibleOutlineNode(s.id, focusRootId, rows, focusRootCollapsed),
  );
  const sidx = siblings.findIndex((s) => s.id === currentId);
  if (sidx < 0) return { nextId: null };
  if (direction === "up") {
    return { nextId: sidx > 0 ? siblings[sidx - 1].id : focusRootId };
  }
  return { nextId: sidx < siblings.length - 1 ? siblings[sidx + 1].id : null };
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
