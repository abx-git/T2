import { describe, expect, it } from "vitest";

import { canInsertAtFocusGap, canNestUnderInFocus } from "@/lib/focus-mode-dnd";
import type { TaskNode } from "@/types/task-node";

function node(id: string, children: TaskNode[] = []): TaskNode {
  return {
    id,
    title: id,
    link: "",
    description: "",
    tags: [],
    dueDate: null,
    reminderDate: null,
    effort: 0,
    children,
  };
}

const roots = [node("a", [node("b", [node("c"), node("d")]), node("e")])];

describe("canNestUnderInFocus", () => {
  it("erlaubt Unterpunkt unter Fokus-Wurzel und Nachfahren", () => {
    expect(canNestUnderInFocus(roots, "e", "a", "a")).toBe(true);
    expect(canNestUnderInFocus(roots, "e", "b", "a")).toBe(true);
  });

  it("verbietet Nest in sich selbst oder eigene Nachfahren", () => {
    expect(canNestUnderInFocus(roots, "b", "b", "a")).toBe(false);
    expect(canNestUnderInFocus(roots, "b", "c", "a")).toBe(false);
  });
});

describe("canInsertAtFocusGap", () => {
  it("erlaubt Einfügen unter Fokus-Wurzel und deren Kinder", () => {
    expect(canInsertAtFocusGap(roots, "e", "a", "a")).toBe(true);
    expect(canInsertAtFocusGap(roots, "c", "b", "a")).toBe(true);
  });

  it("verbietet Einfügen in eigenen Teilbaum", () => {
    expect(canInsertAtFocusGap(roots, "b", "b", "a")).toBe(false);
    expect(canInsertAtFocusGap(roots, "b", "c", "a")).toBe(false);
  });
});
