import { describe, expect, it } from "vitest";

import type { TaskNode } from "@/types/task-node";

import {
  computeCardPositions,
  computeMindmapBoardLayout,
  entriesInColumnTreeOrder,
  measureSubtreeRows,
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


/** Entspricht der Tabellen-Skizze (Karte 1 / 11 / 111 …). */
function demoTree(): TaskNode[] {
  return [
    node("1", [
      node("11", [node("111"), node("112")]),
      node("12", [node("121"), node("122", [node("1221")])]),
    ]),
    node("2", [node("21")]),
    node("3", [
      node("31", [node("311"), node("312"), node("313", [node("3131"), node("3132", [node("31321"), node("31322")]), node("3133")])]),
    ]),
  ];
}

describe("measureSubtreeRows", () => {
  it("Blatt = 1, Parent = Summe der Kinder", () => {
    const roots = demoTree();
    expect(measureSubtreeRows(roots[0]!)).toBe(4);
    expect(measureSubtreeRows(roots[0]!.children[0]!)).toBe(2);
    expect(measureSubtreeRows(roots[0]!.children[1]!)).toBe(2);
    expect(measureSubtreeRows(roots[1]!)).toBe(1);
  });
});

describe("computeMindmapBoardLayout", () => {
  it("jede Karte belegt genau eine Rasterzeile (kein Mindmap-Zellverbund)", () => {
    const layout = computeMindmapBoardLayout(demoTree());
    for (const e of layout.entries) {
      expect(e.rowSpan).toBe(1);
    }
  });

  it("Raster: erstes Kind gleiche Zeile, Geschwister darunter", () => {
    const layout = computeMindmapBoardLayout(demoTree());

    expect(layout.byNodeId.get("1")!.ySlot).toBe(0);
    expect(layout.byNodeId.get("11")!.ySlot).toBe(0);
    expect(layout.byNodeId.get("111")!.ySlot).toBe(0);
    expect(layout.byNodeId.get("112")!.ySlot).toBe(1);
    expect(layout.byNodeId.get("12")!.ySlot).toBe(2);
    expect(layout.byNodeId.get("121")!.ySlot).toBe(2);
    expect(layout.byNodeId.get("122")!.ySlot).toBe(3);
    expect(layout.byNodeId.get("1221")!.ySlot).toBe(3);

    expect(layout.byNodeId.get("2")!.ySlot).toBe(4);
    expect(layout.byNodeId.get("21")!.ySlot).toBe(4);

    expect(layout.byNodeId.get("3")!.ySlot).toBe(5);
    expect(layout.byNodeId.get("31321")!.ySlot).toBe(8);
  });

  it("mehrere Wurzeln stapeln sich", () => {
    const roots = [node("R1"), node("R2", [node("c")])];
    const layout = computeMindmapBoardLayout(roots);
    expect(layout.byNodeId.get("R1")!.ySlot).toBe(0);
    expect(layout.byNodeId.get("R2")!.ySlot).toBe(1);
    expect(layout.byNodeId.get("c")!.ySlot).toBe(1);
  });

  it("eingeklappt: nur eine Zeile", () => {
    const roots = [node("X", [node("C", [node("C1"), node("C2")])])];
    const layout = computeMindmapBoardLayout(roots, new Set(["C"]));
    expect(layout.byNodeId.get("C1")).toBeUndefined();
    expect(layout.totalRows).toBe(1);
  });
});

describe("computeCardPositions", () => {
  it("stapelt Geschwister in derselben Spalte mit konstantem Abstand", () => {
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
    expect(b.top - (a.top + a.height)).toBeCloseTo(MINDMAP_CARD_GAP_PX, 0);
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

  it("Spalte-0-Geschwister unter aufgeklapptem Teilbaum in Spalte 1", () => {
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
    expect(positions.get("12")!.top).toBeGreaterThan(positions.get("112")!.top);
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
    const collapsedPos = computeCardPositions(collapsed.entries, heights, roots);
    expect(collapsedPos.positions.get("12")!.top).toBeLessThan(
      expandedPos.positions.get("12")!.top,
    );
  });

  it("nutzt gemessene Kartenhöhe aus dem DOM", () => {
    const roots = [{ ...node("A"), description: "Lange Beschreibung." }];
    const layout = computeMindmapBoardLayout(roots);
    const heights = new Map<string, number>([["A", 50]]);
    const { positions } = computeCardPositions(layout.entries, heights, roots);
    expect(positions.get("A")!.height).toBe(50);
  });

  it("konstanter Abstand auch wenn Parent höher als Kind in derselben Zeile", () => {
    const roots = [
      {
        ...node("P", [node("A"), node("B")]),
        title: "Sehr langer mehrzeiliger Titel der die Karte deutlich höher macht",
      },
    ];
    const layout = computeMindmapBoardLayout(roots);
    const heights = new Map<string, number>([
      ["P", 96],
      ["A", 48],
      ["B", 48],
    ]);
    const { positions } = computeCardPositions(layout.entries, heights, roots);
    const a = positions.get("A")!;
    const b = positions.get("B")!;
    expect(b.top - (a.top + a.height)).toBeCloseTo(MINDMAP_CARD_GAP_PX, 0);
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
      expect(next.top - (prev.top + prev.height)).toBeCloseTo(MINDMAP_CARD_GAP_PX, 0);
    }
  });
});
