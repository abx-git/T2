import { describe, expect, it } from "vitest";

import {
  applyContextListDrop,
  contextCardDragId,
  contextGapId,
  contextNestDropId,
  insertNodeIntoContextList,
  parseContextCardDragId,
  parseContextGapId,
  parseContextNestDropId,
} from "@/lib/context-list-dnd";
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

describe("context gap ids", () => {
  it("roundtrips parent and index", () => {
    expect(parseContextGapId(contextGapId(null, 2))).toEqual({
      listParentId: null,
      insertIndex: 2,
    });
    expect(parseContextGapId(contextGapId("parent-a", 1))).toEqual({
      listParentId: "parent-a",
      insertIndex: 1,
    });
  });

  it("roundtrips pane-prefixed gap and nest ids", () => {
    expect(parseContextGapId(contextGapId(null, 0, "left"))).toEqual({
      listParentId: null,
      insertIndex: 0,
    });
    expect(parseContextGapId(contextGapId("p", 2, "right"))).toEqual({
      listParentId: "p",
      insertIndex: 2,
    });
    const nest = contextNestDropId("left", "card-1");
    expect(parseContextNestDropId(nest)).toBe("card-1");
    expect(parseContextCardDragId(contextCardDragId("right", "card-2"))).toBe("card-2");
  });
});

describe("applyContextListDrop", () => {
  it("reorders siblings via gap", () => {
    const roots = [node("a", "A"), node("b", "B"), node("c", "C")];
    const next = applyContextListDrop(roots, null, "c", {
      kind: "gap",
      listParentId: null,
      insertIndex: 0,
    });
    expect(next.map((n) => n.id)).toEqual(["c", "a", "b"]);
  });

  it("reorders nested siblings via gap", () => {
    const roots = [node("p", "P", [node("a", "A"), node("b", "B"), node("c", "C")])];
    const next = applyContextListDrop(roots, null, "c", {
      kind: "gap",
      listParentId: "p",
      insertIndex: 0,
    });
    expect(next[0].children.map((n) => n.id)).toEqual(["c", "a", "b"]);
  });

  it("nests under any card", () => {
    const roots = [node("a", "A", [node("a1", "A1")]), node("b", "B")];
    const next = applyContextListDrop(roots, null, "b", { kind: "nest", targetId: "a1" });
    expect(next.map((n) => n.id)).toEqual(["a"]);
    expect(next[0].children.map((n) => n.id)).toEqual(["a1"]);
    expect(next[0].children[0].children.map((n) => n.id)).toEqual(["b"]);
  });

  it("moves nested card to root gap", () => {
    const roots = [node("a", "A", [node("a1", "A1")]), node("b", "B")];
    const next = applyContextListDrop(roots, null, "a1", {
      kind: "gap",
      listParentId: null,
      insertIndex: 2,
    });
    expect(next.map((n) => n.id)).toEqual(["a", "b", "a1"]);
    expect(next[0].children).toEqual([]);
  });
});

describe("insertNodeIntoContextList", () => {
  it("fügt an Lücke unter Kontext ein", () => {
    const roots = [node("a", "A"), node("b", "B")];
    const next = insertNodeIntoContextList(roots, null, node("x", "X"), {
      kind: "gap",
      listParentId: null,
      insertIndex: 1,
    });
    expect(next.map((n) => n.id)).toEqual(["a", "x", "b"]);
  });

  it("hängt unter Peer (Nest)", () => {
    const roots = [node("p", "P", [node("a", "A"), node("b", "B")])];
    const next = insertNodeIntoContextList(roots, "p", node("x", "X"), {
      kind: "nest",
      targetId: "a",
    });
    expect(next[0].children.find((n) => n.id === "a")?.children.map((n) => n.id)).toEqual(["x"]);
  });

  it("fügt in nested Lücke ein", () => {
    const roots = [node("p", "P", [node("a", "A")])];
    const next = insertNodeIntoContextList(roots, null, node("x", "X"), {
      kind: "gap",
      listParentId: "p",
      insertIndex: 1,
    });
    expect(next[0].children.map((n) => n.id)).toEqual(["a", "x"]);
  });
});
