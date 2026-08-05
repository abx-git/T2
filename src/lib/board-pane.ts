/**
 * Dual-pane (Norton-style) navigation: shared tree, per-pane drill context.
 */

import { normalizeContextNodeId } from "@/lib/board-context";
import type { TaskNode } from "@/types/task-node";

export type BoardPaneId = "left" | "right";

export type PaneContexts = Record<BoardPaneId, string | null>;

export const BOARD_PANE_IDS: BoardPaneId[] = ["left", "right"];

export const DEFAULT_PANE_CONTEXTS: PaneContexts = { left: null, right: null };

export function isBoardPaneId(value: unknown): value is BoardPaneId {
  return value === "left" || value === "right";
}

export function normalizePaneContexts(roots: TaskNode[], contexts: PaneContexts): PaneContexts {
  return {
    left: normalizeContextNodeId(roots, contexts.left),
    right: normalizeContextNodeId(roots, contexts.right),
  };
}

/** Prefix for context-list DnD ids so left/right panes never collide. */
export const CONTEXT_PANE_ID_RE = /^pane:(left|right):(.*)$/;

export function withContextPanePrefix(pane: BoardPaneId, bareId: string): string {
  return `pane:${pane}:${bareId}`;
}

export function parseContextPanePrefixedId(id: string | number): {
  pane: BoardPaneId;
  bareId: string;
} | null {
  const m = CONTEXT_PANE_ID_RE.exec(String(id));
  if (!m) return null;
  return { pane: m[1] as BoardPaneId, bareId: m[2]! };
}

export function stripContextPanePrefix(id: string | number): string {
  return parseContextPanePrefixedId(id)?.bareId ?? String(id);
}
