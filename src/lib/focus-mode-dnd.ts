import { findNodeById, subtreeContainsId } from "@/lib/tree-utils";
import type { TaskNode } from "@/types/task-node";

/** Ziel liegt im Fokus-Teilbaum (Fokus-Wurzel oder deren Nachfahre). */
export function isFocusSubtreeTarget(
  roots: TaskNode[],
  targetId: string,
  focusNodeId: string,
): boolean {
  if (targetId === focusNodeId) return true;
  const focus = findNodeById(roots, focusNodeId);
  if (!focus) return false;
  return subtreeContainsId(focus, targetId);
}

/** Als Unterpunkt von `targetId` ablegen (inkl. Fokus-Wurzel). */
export function canNestUnderInFocus(
  roots: TaskNode[],
  activeId: string,
  targetId: string,
  focusNodeId: string,
): boolean {
  if (activeId === targetId) return false;
  const active = findNodeById(roots, activeId);
  if (!active) return false;
  if (subtreeContainsId(active, targetId)) return false;
  return isFocusSubtreeTarget(roots, targetId, focusNodeId);
}

/** Einfügen in Geschwisterliste `listParentId` (z. B. erster Unterpunkt). */
export function canInsertAtFocusGap(
  roots: TaskNode[],
  activeId: string,
  listParentId: string | null,
  focusNodeId: string,
): boolean {
  if (!listParentId) return false;
  const active = findNodeById(roots, activeId);
  const focus = findNodeById(roots, focusNodeId);
  if (!active || !focus) return false;
  if (activeId === listParentId) return false;
  if (subtreeContainsId(active, listParentId)) return false;
  if (listParentId === focusNodeId) return true;
  return subtreeContainsId(focus, listParentId);
}
