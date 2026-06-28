import { describe, expect, it } from "vitest";

import type { TaskNode } from "@/types/task-node";

import {
  computeCardPositions,
  computeMindmapBoardLayout,
  entriesInColumnTreeOrder,
  MINDMAP_CARD_GAP_PX,
  MINDMAP_CARD_MARGIN_Y,
} from "./mindmap-layout";

function node(id: string, children: TaskNode[] = []): TaskNode {
  return {
    id,
    title: id,
    link: "",
    description: "",
    tags: [],
    dueDate: null,
    reminderDate: null,
    effort: 1,
    children,
  };
}

describe("computeMindmapBoardLayout", () => {
  it("ordnet Spalten nach Tiefe", () => {
    const roots = [node("1", [node("11", [node("111")])])];
    const layout = computeMindmapBoardLayout(roots);
    expect(layout.byNodeId.get("1")!.column).toBe(0);
    expect(layout.byNodeId.get("11")!.column).toBe(1);
    expect(layout.byNodeId.get("111")!.column).toBe(2);
  });

  it("eingeklappt: Kinder fehlen im Layout", () => {
    const roots = [node("X", [node("C", [node("C1"), node("C2")])])];
    const layout = computeMindmapBoardLayout(roots, new Set(["C"]));
    expect(layout.byNodeId.get("C1")).toBeUndefined();
    expect(layout.entries).toHaveLength(2);
  });
});

describe("computeCardPositions", () => {
  it("stapelt Geschwister mit festem Abstand (8px oben + unten)", () => {
    const roots = [node("P", [node("A"), node("B")])];
    const layout = computeMindmapBoardLayout(roots);
    const heights = new Map<string, number>([
      ["P", 60],
      ["A", 120],
      ["B", 80],
    ]);
    const { positions } = computeCardPositions(layout.entries, heights, roots);
    const a = positions.get("A")!;
    const b = positions.get("B")!;
    expect(b.top - (a.top + a.height)).toBe(MINDMAP_CARD_GAP_PX);
  });

  it("erstes Kind bündig mit Parent", () => {
    const roots = [node("P", [node("C")])];
    const layout = computeMindmapBoardLayout(roots);
    const heights = new Map<string, number>([
      ["P", 70],
      ["C", 90],
    ]);
    const { positions } = computeCardPositions(layout.entries, heights, roots);
    expect(positions.get("C")!.top).toBe(positions.get("P")!.top);
  });

  it("Spalte-0-Geschwister unter aufgeklapptem Teilbaum", () => {
    const roots = [node("1", [node("11", [node("111"), node("112")]), node("12")])];
    const layout = computeMindmapBoardLayout(roots);
    const heights = new Map<string, number>([
      ["1", 48],
      ["11", 48],
      ["111", 48],
      ["112", 48],
      ["12", 48],
    ]);
    const { positions } = computeCardPositions(layout.entries, heights, roots);
    expect(positions.get("111")!.top).toBe(positions.get("11")!.top);
    expect(positions.get("12")!.top).toBeGreaterThan(
      positions.get("112")!.top + positions.get("112")!.height + MINDMAP_CARD_MARGIN_Y,
    );
  });

  it("eingeklappt: Geschwister rücken nach oben", () => {
    const roots = [node("1", [node("11", [node("111"), node("112")]), node("12")])];
    const expanded = computeMindmapBoardLayout(roots);
    const collapsed = computeMindmapBoardLayout(roots, new Set(["11"]));
    const heights = new Map<string, number>([
      ["1", 48],
      ["11", 48],
      ["12", 48],
    ]);
    const expandedPos = computeCardPositions(expanded.entries, heights, roots);
    const collapsedPos = computeCardPositions(collapsed.entries, heights, roots, new Set(["11"]));
    expect(collapsedPos.positions.get("12")!.top).toBeLessThan(
      expandedPos.positions.get("12")!.top,
    );
  });

  it("nutzt gemessene Kartenhöhe", () => {
    const roots = [{ ...node("A"), description: "Lange Beschreibung." }];
    const layout = computeMindmapBoardLayout(roots);
    const heights = new Map<string, number>([["A", 50]]);
    const { positions } = computeCardPositions(layout.entries, heights, roots);
    expect(positions.get("A")!.height).toBe(50);
  });

  it("konstanter Abstand zwischen allen Nachfolgern in einer Spalte", () => {
    const roots = [node("P", [node("A"), node("B")])];
    const layout = computeMindmapBoardLayout(roots);
    const heights = new Map<string, number>([
      ["P", 60],
      ["A", 100],
      ["B", 80],
    ]);
    const { positions } = computeCardPositions(layout.entries, heights, roots);
    const colEntries = entriesInColumnTreeOrder(1, layout.entries, roots);
    for (let i = 1; i < colEntries.length; i++) {
      const prev = positions.get(colEntries[i - 1]!.node.id)!;
      const next = positions.get(colEntries[i]!.node.id)!;
      expect(next.top - (prev.top + prev.height)).toBe(MINDMAP_CARD_GAP_PX);
    }
  });

  it("tiefe Äste überlappen keine Geschwister in derselben Spalte", () => {
    const roots = [
      node("3", [
        node("31", [node("311"), node("312"), node("313", [node("3131"), node("3132")])]),
      ]),
    ];
    const layout = computeMindmapBoardLayout(roots);
    const heights = new Map<string, number>();
    for (const e of layout.entries) heights.set(e.node.id, 56);
    const { positions } = computeCardPositions(layout.entries, heights, roots);
    const col3 = entriesInColumnTreeOrder(3, layout.entries, roots);
    for (let i = 1; i < col3.length; i++) {
      const prev = positions.get(col3[i - 1]!.node.id)!;
      const next = positions.get(col3[i]!.node.id)!;
      expect(next.top).toBeGreaterThanOrEqual(prev.top + prev.height + MINDMAP_CARD_MARGIN_Y);
    }
  });
});
