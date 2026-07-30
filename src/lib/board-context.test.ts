import { describe, expect, it } from "vitest";

import {
  contextChildren,
  contextIdForRevealingNode,
  contextParentId,
  contextPathIds,
  normalizeContextNodeId,
} from "@/lib/board-context";
import type { TaskNode } from "@/types/task-node";

function node(id: string, title: string, children: TaskNode[] = []): TaskNode {
  return {
    id,
    title,
    link: "",
    description: "",
    tags: [],
    dueDate: null,
    reminderDate: null,
    effort: 0,
    children,
  };
}

const roots = [
  node("a", "A", [node("a1", "A1", [node("a11", "A11")]), node("a2", "A2")]),
  node("b", "B"),
];

describe("board-context", () => {
  it("lists roots when context is null", () => {
    expect(contextChildren(roots, null).map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("lists children of context node", () => {
    expect(contextChildren(roots, "a").map((n) => n.id)).toEqual(["a1", "a2"]);
  });

  it("builds path ids", () => {
    expect(contextPathIds(roots, "a11")).toEqual(["a", "a1", "a11"]);
    expect(contextPathIds(roots, null)).toEqual([]);
  });

  it("resolves parent and reveal context", () => {
    expect(contextParentId(roots, "a1")).toBe("a");
    expect(contextParentId(roots, null)).toBeNull();
    expect(contextIdForRevealingNode(roots, "a11")).toBe("a1");
    expect(contextIdForRevealingNode(roots, "a")).toBeNull();
  });

  it("normalizes missing context", () => {
    expect(normalizeContextNodeId(roots, "a1")).toBe("a1");
    expect(normalizeContextNodeId(roots, "gone")).toBeNull();
  });
});
