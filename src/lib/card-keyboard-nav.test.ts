import { describe, expect, it } from "vitest";

import {
  firstContextCardId,
  focusTargetAfterRemoving,
  navigateContextCard,
  navigateExpandedCard,
} from "@/lib/card-keyboard-nav";
import { flattenVisibleCards } from "@/lib/card-expand";
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

describe("navigateContextCard", () => {
  const siblings = [
    node("a", "A", [node("a1", "A1")]),
    node("b", "B"),
    node("c", "C"),
  ];

  it("navigiert Geschwister", () => {
    expect(navigateContextCard(siblings, "a", "down").nextId).toBe("b");
    expect(navigateContextCard(siblings, "b", "up").nextId).toBe("a");
    expect(navigateContextCard(siblings, "c", "down").nextId).toBeNull();
  });

  it("drill-in nach rechts, drill-up nach links", () => {
    expect(navigateContextCard(siblings, "a", "right")).toEqual({
      nextId: "a",
      shouldDrillIn: true,
    });
    expect(navigateContextCard(siblings, "b", "right").nextId).toBeNull();
    expect(navigateContextCard(siblings, "a", "left")).toEqual({
      nextId: null,
      shouldDrillUp: true,
    });
  });

  it("firstContextCardId", () => {
    expect(firstContextCardId(siblings)).toBe("a");
    expect(firstContextCardId([])).toBeNull();
  });
});

describe("navigateExpandedCard", () => {
  const roots = [
    node("a", "A", [node("a1", "A1"), node("a2", "A2")]),
    node("b", "B"),
  ];

  it("klappt nach rechts auf und navigiert in Kinder", () => {
    const collapsed = new Set(["a"]);
    const visible = flattenVisibleCards(roots, collapsed);
    expect(navigateExpandedCard(visible, collapsed, "a", "right")).toEqual({
      nextId: "a",
      shouldExpand: true,
    });

    const open = flattenVisibleCards(roots, new Set());
    expect(navigateExpandedCard(open, new Set(), "a", "right").nextId).toBe("a1");
    expect(navigateExpandedCard(open, new Set(), "a1", "down").nextId).toBe("a2");
  });

  it("klappt nach links zu oder geht zum Parent", () => {
    const open = flattenVisibleCards(roots, new Set());
    expect(navigateExpandedCard(open, new Set(), "a", "left")).toEqual({
      nextId: "a",
      shouldCollapse: true,
    });
    expect(navigateExpandedCard(open, new Set(), "a1", "left").nextId).toBe("a");
    expect(navigateExpandedCard(open, new Set(["a"]), "b", "left")).toEqual({
      nextId: null,
      shouldDrillUp: true,
    });
  });
});

describe("focusTargetAfterRemoving", () => {
  const roots = [node("a", "A", [node("b", "B"), node("c", "C")])];

  it("bevorzugt vorherige Geschwisterkarte", () => {
    expect(focusTargetAfterRemoving(roots, "c")).toBe("b");
  });

  it("fällt auf Parent zurück ohne Geschwister", () => {
    expect(focusTargetAfterRemoving([node("a", "A", [node("b", "B")])], "b")).toBe("a");
  });
});
