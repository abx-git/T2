/**
 * Drill-down context: which node’s children are shown in the main list.
 */

import {
  findDirectParentId,
  findNodeById,
  getSiblingsList,
  pathFromRootToNode,
} from "@/lib/tree-utils";
import { isTaskMarkedDone } from "@/lib/task-tags";
import type { TaskNode } from "@/types/task-node";

/** Children visible in the context list (`null` context = board roots). */
export function contextChildren(
  roots: TaskNode[],
  contextNodeId: string | null,
  options?: { hideCompleted?: boolean; completedTag?: string },
): TaskNode[] {
  const raw =
    contextNodeId === null
      ? roots
      : (findNodeById(roots, contextNodeId)?.children ?? []);
  if (!options?.hideCompleted || !options.completedTag) return raw;
  return raw.filter((n) => !isTaskMarkedDone(n, options.completedTag!));
}

/** Breadcrumb path ids from root to context (empty when at roots). */
export function contextPathIds(roots: TaskNode[], contextNodeId: string | null): string[] {
  if (!contextNodeId) return [];
  return pathFromRootToNode(roots, contextNodeId) ?? [];
}

export function contextPathNodes(
  roots: TaskNode[],
  contextNodeId: string | null,
): TaskNode[] {
  return contextPathIds(roots, contextNodeId)
    .map((id) => findNodeById(roots, id))
    .filter((n): n is TaskNode => Boolean(n));
}

/** Parent of current context (`null` = already at roots). */
export function contextParentId(
  roots: TaskNode[],
  contextNodeId: string | null,
): string | null {
  if (!contextNodeId) return null;
  const parent = findDirectParentId(roots, contextNodeId);
  if (parent === undefined) return null;
  return parent;
}

/**
 * After search/select: show the hit among its siblings (context = parent).
 * Returns the context to set.
 */
export function contextIdForRevealingNode(
  roots: TaskNode[],
  nodeId: string,
): string | null {
  const parent = findDirectParentId(roots, nodeId);
  if (parent === undefined) return null;
  return parent;
}

/** Normalize context after tree edits — drop if node vanished. */
export function normalizeContextNodeId(
  roots: TaskNode[],
  contextNodeId: string | null,
): string | null {
  if (!contextNodeId) return null;
  return findNodeById(roots, contextNodeId) ? contextNodeId : null;
}

export function siblingIndexInContext(
  roots: TaskNode[],
  contextNodeId: string | null,
  nodeId: string,
): number {
  return getSiblingsList(roots, contextNodeId).findIndex((n) => n.id === nodeId);
}
