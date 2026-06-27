import { describe, expect, it } from "vitest";

import { buildFocusOutlineRows } from "@/lib/focus-mode-outline";
import {
  collapsedIdsAfterBoardDepthAction,
  collapsedIdsAfterFocusDepthAction,
  defaultBoardCollapsedIds,
  getBoardMaxVisibleLevels,
} from "@/lib/tree-depth-collapse";
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

describe("getBoardMaxVisibleLevels", () => {
  it("zählt Ebenen ab Wurzelebene", () => {
    const roots = [node("a", "A", [node("b", "B", [node("c", "C")])])];
    expect(getBoardMaxVisibleLevels(roots)).toBe(3);
    expect(getBoardMaxVisibleLevels([node("x", "X")])).toBe(1);
  });
});

describe("collapsedIdsAfterBoardDepthAction", () => {
  const roots = [
    node("a", "A", [node("b", "B", [node("c", "C")])]),
    node("e", "E"),
  ];

  it("klappt auf 1 Ebene (nur Wurzelkarten) ein", () => {
    const collapsed = collapsedIdsAfterBoardDepthAction([], roots, 1);
    expect(collapsed).toEqual(["a"]);
    expect(getBoardMaxVisibleLevels(roots)).toBeGreaterThan(1);
  });

  it("klappt auf 2 Ebenen ein", () => {
    const collapsed = collapsedIdsAfterBoardDepthAction([], roots, 2);
    expect(collapsed).toEqual(["b"]);
  });

  it("klappt alle Ebenen auf", () => {
    const collapsed = collapsedIdsAfterBoardDepthAction(["a", "outside"], roots, null);
    expect(collapsed).toEqual(["outside"]);
  });

  it("defaultBoardCollapsedIds entspricht Ebene 1", () => {
    expect(defaultBoardCollapsedIds(roots)).toEqual(["a"]);
    expect(defaultBoardCollapsedIds([node("x", "X")])).toEqual([]);
  });
});

describe("collapsedIdsAfterFocusDepthAction", () => {
  const focus = node("a", "A", [
    node("b", "B", [node("c", "C"), node("d", "D")]),
    node("e", "E"),
  ]);

  it("klappt auf 1 Ebene ein und lässt danach manuelles Aufklappen zu", () => {
    const collapsed = collapsedIdsAfterFocusDepthAction([], focus, 1);
    expect(collapsed).toEqual(["b"]);
    const rows = buildFocusOutlineRows([focus], "a", false, "Erledigt", {
      collapsedIds: new Set(collapsed),
    });
    expect(rows.map((r) => r.node.id)).toEqual(["b", "e"]);

    const expanded = collapsed.filter((id) => id !== "b");
    const rowsAfterExpand = buildFocusOutlineRows([focus], "a", false, "Erledigt", {
      collapsedIds: new Set(expanded),
    });
    expect(rowsAfterExpand.map((r) => r.node.id)).toEqual(["b", "c", "d", "e"]);
  });

  it("klappt auf 2 Ebenen ein", () => {
    const deepFocus = node("a", "A", [
      node("b", "B", [node("c", "C", [node("f", "F")])]),
      node("e", "E"),
    ]);
    const collapsed = collapsedIdsAfterFocusDepthAction([], deepFocus, 2);
    expect(collapsed).toEqual(["c"]);
  });

  it("klappt alle Ebenen auf", () => {
    const collapsed = collapsedIdsAfterFocusDepthAction(["b", "x"], focus, null);
    expect(collapsed).toEqual(["x"]);
  });

  it("lässt collapsedIds außerhalb des Fokus-Teilbaums unverändert", () => {
    const collapsed = collapsedIdsAfterFocusDepthAction(["outside", "b"], focus, 1);
    expect(collapsed).toEqual(["outside", "b"]);
  });
});
