import type { FocusOutlineRow } from "@/lib/focus-mode-outline";
import type { MindmapBoardLayout } from "@/lib/mindmap-layout";
import { findDirectParentId, findNodeById, getSiblingsList } from "@/lib/tree-utils";
import type { TaskNode } from "@/types/task-node";

export type CardNavDirection = "up" | "down" | "left" | "right";

export type CardNavResult = {
  nextId: string | null;
  /** Zweig vor Navigation in die erste Unterkarte aufklappen. */
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

export function firstBoardCardId(layout: MindmapBoardLayout): string | null {
  return layout.entries[0]?.node.id ?? null;
}

/** Geschwister-Navigation in derselben Mindmap-Spalte. */
export function navigateBoardCard(
  layout: MindmapBoardLayout,
  collapsedIds: ReadonlySet<string>,
  currentId: string,
  direction: CardNavDirection,
): CardNavResult {
  const entry = layout.byNodeId.get(currentId);
  if (!entry) return { nextId: null };

  const node = entry.node;

  if (direction === "left") {
    if (entry.listParentId === null) return { nextId: null };
    return { nextId: entry.listParentId };
  }

  if (direction === "right") {
    if (node.children.length === 0) return { nextId: null };
    if (collapsedIds.has(currentId)) {
      return { nextId: node.children[0].id, shouldExpand: true };
    }
    return { nextId: node.children[0].id };
  }

  const column = layout.byColumn.get(entry.column) ?? [];
  const idx = column.findIndex((e) => e.node.id === currentId);
  if (idx < 0) return { nextId: null };

  if (direction === "up") {
    return { nextId: idx > 0 ? column[idx - 1].node.id : null };
  }

  return { nextId: idx < column.length - 1 ? column[idx + 1].node.id : null };
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

/** Baum-Navigation in der Fokus-Outline inkl. Fokus-Wurzel. */
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

  if (direction === "left") {
    const parentId = row.listParentId;
    return { nextId: parentId };
  }

  if (direction === "right") {
    if (node.children.length === 0) return { nextId: null };
    if (collapsedIds.has(currentId)) {
      return { nextId: node.children[0].id, shouldExpand: true };
    }
    return { nextId: node.children[0].id };
  }

  if (direction === "up") {
    if (row.depth === 1) return { nextId: focusRootId };
    const siblings = getSiblingsList(roots, row.listParentId);
    const idx = siblings.findIndex((s) => s.id === currentId);
    if (idx > 0) {
      const candidate = siblings[idx - 1].id;
      return isVisibleOutlineNode(candidate, focusRootId, rows, focusRootCollapsed)
        ? { nextId: candidate }
        : { nextId: null };
    }
    return { nextId: null };
  }

  const siblings = getSiblingsList(roots, row.listParentId);
  const idx = siblings.findIndex((s) => s.id === currentId);
  if (idx >= 0 && idx < siblings.length - 1) {
    const candidate = siblings[idx + 1].id;
    return isVisibleOutlineNode(candidate, focusRootId, rows, focusRootCollapsed)
      ? { nextId: candidate }
      : { nextId: null };
  }
  return { nextId: null };
}

/** Nächster sinnvoller Fokus nach dem Entfernen einer Karte (vor dem Löschen berechnen). */
export function focusTargetAfterRemoving(roots: TaskNode[], removedId: string): string | null {
  const parentResult = findDirectParentId(roots, removedId);
  if (parentResult === undefined) return null;
  const siblings = getSiblingsList(roots, parentResult);
  const idx = siblings.findIndex((s) => s.id === removedId);
  if (idx < 0) return parentResult;
  if (idx > 0) return siblings[idx - 1].id;
  if (idx < siblings.length - 1) return siblings[idx + 1].id;
  return parentResult;
}
