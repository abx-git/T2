import { describe, expect, it } from "vitest";

import { rootsForMindmapDisplay } from "@/lib/tree-utils";
import type { TaskNode } from "@/types/task-node";

function node(
  id: string,
  title: string,
  opts: {
    tags?: string[];
    dueDate?: Date | null;
    reminderDate?: Date | null;
    cardColor?: TaskNode["cardColor"];
    children?: TaskNode[];
  } = {},
): TaskNode {
  return {
    id,
    title,
    link: "",
    description: "",
    tags: opts.tags ?? [],
    dueDate: opts.dueDate ?? null,
    reminderDate: opts.reminderDate ?? null,
    effort: 0,
    ...(opts.cardColor ? { cardColor: opts.cardColor } : {}),
    children: opts.children ?? [],
  };
}

describe("rootsForMindmapDisplay", () => {
  it("hebt Kinder erledigter Knoten an", () => {
    const roots = [
      node("a", "A", {
        tags: ["Erledigt"],
        children: [node("b", "B"), node("c", "C")],
      }),
      node("d", "D"),
    ];
    const display = rootsForMindmapDisplay(roots, {
      hideCompletedTasks: true,
      completedTag: "Erledigt",
      filterTags: [],
    });
    expect(display.map((n) => n.id)).toEqual(["b", "c", "d"]);
  });

  it("filtert nach Tags inkl. Nachfahren", () => {
    const roots = [
      node("a", "A", {
        children: [node("b", "B", { tags: ["x"] })],
      }),
      node("c", "C"),
    ];
    const display = rootsForMindmapDisplay(roots, {
      hideCompletedTasks: false,
      completedTag: "Erledigt",
      filterTags: ["x"],
    });
    expect(display.map((n) => n.id)).toEqual(["a"]);
    expect(display[0]?.children.map((n) => n.id)).toEqual(["b"]);
  });

  it("filtert nach Farbe inkl. Nachfahren", () => {
    const roots = [
      node("a", "A", {
        children: [node("b", "B", { cardColor: "sky" })],
      }),
      node("c", "C", { cardColor: "rose" }),
    ];
    const display = rootsForMindmapDisplay(roots, {
      hideCompletedTasks: false,
      completedTag: "Erledigt",
      filterTags: [],
      filterColors: ["sky"],
    });
    expect(display.map((n) => n.id)).toEqual(["a"]);
    expect(display[0]?.children.map((n) => n.id)).toEqual(["b"]);
  });

  it("filtert nach Fälligkeit und kombiniert mit Tag (AND)", () => {
    const due = new Date("2026-06-01T00:00:00");
    const roots = [
      node("a", "A", { tags: ["x"], dueDate: due }),
      node("b", "B", { tags: ["x"] }),
      node("c", "C", { dueDate: due }),
    ];
    const display = rootsForMindmapDisplay(roots, {
      hideCompletedTasks: false,
      completedTag: "Erledigt",
      filterTags: ["x"],
      filterScheduleKinds: ["due"],
    });
    expect(display.map((n) => n.id)).toEqual(["a"]);
  });

  it("kombiniert Filter-Dimensionen mit OR", () => {
    const due = new Date("2026-06-01T00:00:00");
    const roots = [
      node("a", "A", { tags: ["x"], dueDate: due }),
      node("b", "B", { tags: ["x"] }),
      node("c", "C", { dueDate: due }),
      node("d", "D"),
    ];
    const display = rootsForMindmapDisplay(roots, {
      hideCompletedTasks: false,
      completedTag: "Erledigt",
      filterTags: ["x"],
      filterScheduleKinds: ["due"],
      filterCombineMode: "or",
    });
    expect(display.map((n) => n.id).sort()).toEqual(["a", "b", "c"]);
  });
});
