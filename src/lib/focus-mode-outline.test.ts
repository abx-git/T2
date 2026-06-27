import { describe, expect, it } from "vitest";

import {
  buildFocusOutlineRows,
  collapsedIdsAfterFocusDepthAction,
  columnIndexForSiblingList,
  countFocusSubtree,
  getFocusOutlineMaxDepth,
  pruneEmptyUxLeavesInFocusSubtree,
} from "@/lib/focus-mode-outline";
import type { TaskNode } from "@/types/task-node";

function node(id: string, title: string, children: TaskNode[] = [], tags: string[] = []): TaskNode {
  return {
    id,
    title,
    link: "",
    description: "",
    tags,
    dueDate: null,
    reminderDate: null,
    effort: 0,
    children,
  };
}

describe("buildFocusOutlineRows", () => {
  const roots = [
    node("a", "A", [
      node("b", "B", [node("c", "C"), node("d", "D", [], ["Erledigt"])]),
      node("e", "E"),
    ]),
  ];

  it("liefert Nachfahren in Baumreihenfolge mit korrekter Tiefe", () => {
    const rows = buildFocusOutlineRows(roots, "a", false, "Erledigt");
    expect(rows.map((r) => r.node.id)).toEqual(["b", "c", "d", "e"]);
    expect(rows.map((r) => r.depth)).toEqual([1, 2, 2, 1]);
    expect(rows.find((r) => r.node.id === "c")?.listParentId).toBe("b");
  });

  it("blendet erledigte Karten aus, behält echte Geschwister-Indizes", () => {
    const rows = buildFocusOutlineRows(roots, "a", true, "Erledigt");
    expect(rows.map((r) => r.node.id)).toEqual(["b", "c", "e"]);
    expect(rows.find((r) => r.node.id === "c")?.siblingIndex).toBe(0);
    expect(rows.find((r) => r.node.id === "e")?.siblingIndex).toBe(1);
  });

  it("blendet Unterpunkte eingeklappter Knoten aus", () => {
    const rows = buildFocusOutlineRows(roots, "a", false, "Erledigt", {
      collapsedIds: new Set(["b"]),
    });
    expect(rows.map((r) => r.node.id)).toEqual(["b", "e"]);
  });

  it("blendet alle Unterpunkte aus, wenn der Fokus-Knoten eingeklappt ist", () => {
    const rows = buildFocusOutlineRows(roots, "a", false, "Erledigt", {
      collapsedIds: new Set(["a"]),
    });
    expect(rows).toEqual([]);
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

describe("getFocusOutlineMaxDepth", () => {
  const roots = [
    node("a", "A", [
      node("b", "B", [node("c", "C")]),
      node("e", "E"),
    ]),
  ];

  it("liefert die tiefste sichtbare Ebene", () => {
    expect(getFocusOutlineMaxDepth(roots, "a", false, "Erledigt")).toBe(2);
    expect(getFocusOutlineMaxDepth(roots, "e", false, "Erledigt")).toBe(0);
  });
});

describe("columnIndexForSiblingList", () => {
  const roots = [node("a", "A", [node("b", "B", [node("c", "C")])])];

  it("Wurzel-Geschwister → Spalte 0", () => {
    expect(columnIndexForSiblingList(roots, null)).toBe(0);
  });

  it("Kinder von a → Spalte 1", () => {
    expect(columnIndexForSiblingList(roots, "a")).toBe(1);
  });

  it("Kinder von b → Spalte 2", () => {
    expect(columnIndexForSiblingList(roots, "b")).toBe(2);
  });
});

describe("pruneEmptyUxLeavesInFocusSubtree", () => {
  it("entfernt leere Blätter im Fokus-Teilbaum, behält Fokus-Knoten", () => {
    const roots = [
      node("a", "A", [
        node("b", "B"),
        node("empty", ""),
        node("c", "C", [node("empty2", "")]),
      ]),
    ];
    const { roots: next, removedIds } = pruneEmptyUxLeavesInFocusSubtree(roots, "a");
    expect(removedIds).toEqual(["empty", "empty2"]);
    expect(findNodeById(next, "a")?.children.map((c) => c.id)).toEqual(["b", "c"]);
  });

  it("entfernt leeren Fokus-Knoten ohne Kinder", () => {
    const roots = [node("a", "A", [node("focus", "")])];
    const { roots: next, removedIds } = pruneEmptyUxLeavesInFocusSubtree(roots, "focus");
    expect(removedIds).toEqual(["focus"]);
    expect(findNodeById(next, "focus")).toBeNull();
  });
});

function findNodeById(nodes: TaskNode[], id: string): TaskNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNodeById(n.children, id);
    if (found) return found;
  }
  return null;
}

describe("countFocusSubtree", () => {
  it("zählt Fokus-Knoten und alle Nachfahren", () => {
    const root = node("a", "A", [node("b", "B"), node("c", "C", [], ["Erledigt"])]);
    expect(countFocusSubtree(root, "Erledigt")).toEqual({ total: 3, done: 1, open: 2 });
  });
});
