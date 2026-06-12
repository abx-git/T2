import { describe, expect, it } from "vitest";

import { computeMindmapBoardLayout } from "@/lib/mindmap-layout";
import { rootsForMindmapDisplay } from "@/lib/tree-utils";
import type { TaskNode } from "@/types/task-node";

function node(
  id: string,
  opts: { tags?: string[]; children?: TaskNode[]; title?: string } = {},
): TaskNode {
  return {
    id,
    title: opts.title ?? id,
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
  it("Tag-Filter: kompakteres Layout ohne Platzhalter für ausgeblendete Äste", () => {
    const roots = [
      node("a", {
        children: [
          node("a1", { tags: ["X"] }),
          node("a2", { children: [node("a21")] }),
        ],
      }),
      node("b"),
    ];

    const full = computeMindmapBoardLayout(roots, new Set());
    const filteredRoots = rootsForMindmapDisplay(roots, {
      hideCompletedTasks: false,
      completedTag: "Erledigt",
      filterTags: ["X"],
    });
    const filtered = computeMindmapBoardLayout(filteredRoots, new Set());

    expect(full.entries.length).toBeGreaterThan(filtered.entries.length);
    expect(filtered.entries.map((e) => e.node.id).sort()).toEqual(["a", "a1"].sort());
    expect(filtered.totalRows).toBeLessThanOrEqual(full.totalRows);
  });

  it("Erledigt ausblenden: erledigte Karte entfernen, Kind nach oben ziehen", () => {
    const roots = [
      node("p", {
        children: [node("c", { tags: ["Erledigt"], title: "done" }), node("o", { title: "open" })],
      }),
    ];

    const display = rootsForMindmapDisplay(roots, {
      hideCompletedTasks: true,
      completedTag: "Erledigt",
      filterTags: [],
    });

    expect(display).toHaveLength(1);
    expect(display[0]!.id).toBe("p");
    expect(display[0]!.children.map((c) => c.id)).toEqual(["o"]);
  });
});
