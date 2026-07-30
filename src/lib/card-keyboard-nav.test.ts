import { describe, expect, it } from "vitest";

import {
  firstContextCardId,
  focusTargetAfterRemoving,
  navigateContextCard,
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

describe("focusTargetAfterRemoving", () => {
  const roots = [node("a", "A", [node("b", "B"), node("c", "C")])];

  it("bevorzugt vorherige Geschwisterkarte", () => {
    expect(focusTargetAfterRemoving(roots, "c")).toBe("b");
  });

  it("fällt auf Parent zurück ohne Geschwister", () => {
    expect(focusTargetAfterRemoving([node("a", "A", [node("b", "B")])], "b")).toBe("a");
  });
});
