import { describe, expect, it } from "vitest";

import type { TaskNode } from "@/types/task-node";

import {
  computeMindmapBoardLayout,
  layoutMindmap,
  MINDMAP_CARD_GAP_PX,
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

describe("layoutMindmap", () => {
  it("stapelt Geschwister mit festem Abstand", () => {
    const roots = [node("P", [node("A"), node("B")])];
    const heights = new Map<string, number>([
      ["P", 60],
      ["A", 120],
      ["B", 80],
    ]);
    const { positions } = layoutMindmap(roots, new Set(), heights);
    const a = positions.get("A")!;
    const b = positions.get("B")!;
    expect(b.top - (a.top + a.height)).toBe(MINDMAP_CARD_GAP_PX);
  });

  it("erstes Kind bündig mit Parent", () => {
    const roots = [node("P", [node("C")])];
    const heights = new Map<string, number>([
      ["P", 70],
      ["C", 90],
    ]);
    const { positions } = layoutMindmap(roots, new Set(), heights);
    expect(positions.get("C")!.top).toBe(positions.get("P")!.top);
  });

  it("Geschwister in Spalte 0 unter aufgeklapptem Teilbaum", () => {
    const roots = [node("1", [node("11", [node("111"), node("112")]), node("12")])];
    const heights = new Map<string, number>([
      ["1", 48],
      ["11", 48],
      ["111", 48],
      ["112", 48],
      ["12", 48],
    ]);
    const { positions } = layoutMindmap(roots, new Set(), heights);
    expect(positions.get("111")!.top).toBe(positions.get("11")!.top);
    expect(positions.get("12")!.top).toBeGreaterThan(positions.get("112")!.top);
  });

  it("eingeklappt: Geschwister rücken nach oben", () => {
    const roots = [node("1", [node("11", [node("111"), node("112")]), node("12")])];
    const heights = new Map<string, number>([
      ["1", 48],
      ["11", 48],
      ["12", 48],
    ]);
    const expanded = layoutMindmap(roots, new Set(), heights);
    const collapsed = layoutMindmap(roots, new Set(["11"]), heights);
    expect(collapsed.positions.get("12")!.top).toBeLessThan(
      expanded.positions.get("12")!.top,
    );
  });

  it("keine Überlappung in tiefer Spalte", () => {
    const roots = [
      node("3", [
        node("31", [node("311"), node("312"), node("313", [node("3131"), node("3132")])]),
      ]),
    ];
    const heights = new Map<string, number>();
    for (const id of ["3", "31", "311", "312", "313", "3131", "3132"]) {
      heights.set(id, 56);
    }
    const { layout, positions } = layoutMindmap(roots, new Set(), heights);
    const col3 = layout.entries
      .filter((e) => e.column === 3)
      .map((e) => positions.get(e.node.id)!)
      .sort((a, b) => a.top - b.top);
    for (let i = 1; i < col3.length; i++) {
      expect(col3[i]!.top).toBeGreaterThanOrEqual(
        col3[i - 1]!.top + col3[i - 1]!.height + MINDMAP_CARD_GAP_PX - 0.01,
      );
    }
  });

  it("liefert Drop-Zonen zwischen Karten", () => {
    const roots = [node("A"), node("B")];
    const { dropGaps } = layoutMindmap(roots, new Set(), new Map());
    expect(dropGaps.length).toBeGreaterThan(0);
  });
});
