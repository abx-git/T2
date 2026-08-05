import { describe, expect, it } from "vitest";

import {
  applyOutlineDrop,
  boardNodeIdFromDragActive,
  insertNodeIntoOutline,
  outlineDragId,
  outlineDropFromOverId,
  outlineGapId,
  outlineNestId,
  parseOutlineDragId,
} from "@/lib/outline-dnd";
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

describe("outline id helpers", () => {
  it("roundtrips drag / gap / nest ids", () => {
    expect(parseOutlineDragId(outlineDragId("a"))).toBe("a");
    expect(boardNodeIdFromDragActive(outlineDragId("a"))).toBe("a");
    expect(boardNodeIdFromDragActive("a")).toBe("a");
    expect(boardNodeIdFromDragActive("pane:left:context-card:xyz")).toBe("xyz");
    expect(outlineDropFromOverId(outlineGapId(null, "b"))).toEqual({
      kind: "gap",
      listParentId: null,
      beforeId: "b",
    });
    expect(outlineDropFromOverId(outlineGapId("p", null))).toEqual({
      kind: "gap",
      listParentId: "p",
      beforeId: null,
    });
    expect(outlineDropFromOverId(outlineNestId("x"))).toEqual({
      kind: "nest",
      targetId: "x",
    });
  });
});

describe("applyOutlineDrop", () => {
  it("reorders roots via beforeId", () => {
    const roots = [node("a", "A"), node("b", "B"), node("c", "C")];
    const next = applyOutlineDrop(roots, "c", {
      kind: "gap",
      listParentId: null,
      beforeId: "a",
    });
    expect(next.map((n) => n.id)).toEqual(["c", "a", "b"]);
  });

  it("moves subtree under another node", () => {
    const roots = [
      node("a", "A", [node("a1", "A1")]),
      node("b", "B"),
    ];
    const next = applyOutlineDrop(roots, "a", { kind: "nest", targetId: "b" });
    expect(next.map((n) => n.id)).toEqual(["b"]);
    expect(next[0].children.map((n) => n.id)).toEqual(["a"]);
    expect(next[0].children[0].children.map((n) => n.id)).toEqual(["a1"]);
  });

  it("rejects nesting into own subtree", () => {
    const roots = [node("a", "A", [node("a1", "A1")])];
    const next = applyOutlineDrop(roots, "a", { kind: "nest", targetId: "a1" });
    expect(next).toBe(roots);
  });

  it("inserts before sibling under parent", () => {
    const roots = [node("p", "P", [node("a", "A"), node("b", "B"), node("c", "C")])];
    const next = applyOutlineDrop(roots, "c", {
      kind: "gap",
      listParentId: "p",
      beforeId: "a",
    });
    expect(next[0].children.map((n) => n.id)).toEqual(["c", "a", "b"]);
  });

  it("inserts external node before sibling", () => {
    const roots = [node("a", "A"), node("b", "B")];
    const next = insertNodeIntoOutline(roots, node("x", "X"), {
      kind: "gap",
      listParentId: null,
      beforeId: "b",
    });
    expect(next.map((n) => n.id)).toEqual(["a", "x", "b"]);
  });
});
