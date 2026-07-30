import { describe, expect, it } from "vitest";

import { rootsForMindmapDisplay } from "@/lib/tree-utils";
import type { TaskNode } from "@/types/task-node";

function node(
  id: string,
  title: string,
  opts: { tags?: string[]; children?: TaskNode[] } = {},
): TaskNode {
  return {
    id,
    title,
    link: "",
    description: "",
    tags: opts.tags ?? [],
    dueDate: null,
    reminderDate: null,
    effort: 0,
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
});
