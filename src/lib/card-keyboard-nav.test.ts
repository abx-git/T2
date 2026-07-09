import { describe, expect, it } from "vitest";

import { buildFocusOutlineRows } from "@/lib/focus-mode-outline";
import { getMindmapBoardLayout } from "@/lib/tree-utils";
import {
  firstBoardCardId,
  focusTargetAfterRemoving,
  navigateBoardCard,
  navigateOutlineCard,
} from "@/lib/card-keyboard-nav";
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

describe("navigateBoardCard", () => {
  const roots = [
    node("a", "A", [node("b", "B", [node("c", "C")]), node("d", "D")]),
    node("e", "E"),
  ];
  const collapsed = new Set<string>();
  const layout = getMindmapBoardLayout(roots, collapsed);

  it("navigiert Geschwister in derselben Spalte", () => {
    expect(navigateBoardCard(layout, collapsed, "b", "down").nextId).toBe("d");
    expect(navigateBoardCard(layout, collapsed, "d", "up").nextId).toBe("b");
    expect(navigateBoardCard(layout, collapsed, "a", "down").nextId).toBe("e");
  });

  it("navigiert zwischen Eltern und Kind", () => {
    expect(navigateBoardCard(layout, collapsed, "b", "left").nextId).toBe("a");
    expect(navigateBoardCard(layout, collapsed, "a", "right").nextId).toBe("b");
    expect(navigateBoardCard(layout, collapsed, "c", "left").nextId).toBe("b");
  });

  it("schlägt Aufklappen vor, wenn Zweig eingeklappt ist", () => {
    const folded = new Set(["b"]);
    const result = navigateBoardCard(layout, folded, "b", "right");
    expect(result).toEqual({ nextId: "c", shouldExpand: true });
  });
});

describe("navigateOutlineCard", () => {
  const roots = [node("a", "A", [node("b", "B", [node("c", "C")]), node("d", "D")])];
  const collapsed = new Set<string>();
  const rows = buildFocusOutlineRows(roots, "a", false, "Erledigt", { collapsedIds: collapsed });

  it("springt von der Fokus-Wurzel zum ersten Unterpunkt", () => {
    expect(navigateOutlineCard(roots, collapsed, "a", rows, false, "a", "down").nextId).toBe("b");
  });

  it("springt vom ersten Unterpunkt zurück zur Fokus-Wurzel", () => {
    expect(navigateOutlineCard(roots, collapsed, "a", rows, false, "b", "up").nextId).toBe("a");
  });

  it("navigiert Geschwister und Kinder in der Outline", () => {
    expect(navigateOutlineCard(roots, collapsed, "a", rows, false, "b", "down").nextId).toBe("d");
    expect(navigateOutlineCard(roots, collapsed, "a", rows, false, "b", "right").nextId).toBe("c");
    expect(navigateOutlineCard(roots, collapsed, "a", rows, false, "c", "left").nextId).toBe("b");
  });
});

describe("focusTargetAfterRemoving", () => {
  const roots = [node("a", "A", [node("b", "B"), node("c", "C")])];

  it("bevorzugt vorherige Geschwisterkarte", () => {
    expect(focusTargetAfterRemoving(roots, "c")).toBe("b");
  });

  it("fällt auf nächste Geschwisterkarte zurück", () => {
    expect(focusTargetAfterRemoving(roots, "b")).toBe("c");
  });

  it("fällt auf Eltern zurück, wenn einziges Kind", () => {
    const singleChild = [node("a", "A", [node("b", "B")])];
    expect(focusTargetAfterRemoving(singleChild, "b")).toBe("a");
  });
});

describe("firstBoardCardId", () => {
  it("liefert die erste sichtbare Karte", () => {
    const roots = [node("x", "X"), node("y", "Y")];
    const layout = getMindmapBoardLayout(roots, new Set());
    expect(firstBoardCardId(layout)).toBe("x");
  });
});
