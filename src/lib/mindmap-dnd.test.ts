import { describe, expect, it } from "vitest";

import type { TaskNode } from "@/types/task-node";

import {
  applyMindmapDrop,
  boardColumnCount,
  buildMindmapDropPreview,
  gapIndexToInsertAfterDetach,
  getColumnDisplayRows,
  insertIndexBelowCardAmongSiblings,
  type TreeDragOverKind,
} from "./tree-utils";

/** Minimaler Knoten nur für Struktur-/DnD-Tests. */
function node(id: string, children: TaskNode[] = []): TaskNode {
  return {
    id,
    title: id,
    description: "",
    tags: [],
    dueDate: null,
    reminderDate: null,
    effort: 1,
    children,
  };
}

/** Stabile Baum-Signatur: `id(child1,child2)` rekursiv. */
function shape(nodes: TaskNode[]): string {
  return nodes.map((n) => `${n.id}(${shape(n.children)})`).join("");
}

function card(
  cardId: string,
  columnIndex: number,
  listParentId: string | null,
): TreeDragOverKind {
  return { kind: "card", cardId, columnIndex, listParentId };
}

function gap(columnIndex: number, insertIndex: number, listParentId: string | null): TreeDragOverKind {
  return { kind: "columnGap", columnIndex, insertIndex, listParentId };
}

describe("gapIndexToInsertAfterDetach", () => {
  const sibs = [node("a"), node("b"), node("c")];

  it("Slot vor Index 2: a von Position 0 nach vor c", () => {
    expect(gapIndexToInsertAfterDetach(sibs, "a", 2)).toBe(1);
  });

  it("Ans Ende (Slot Länge)", () => {
    expect(gapIndexToInsertAfterDetach(sibs, "b", 3)).toBe(2);
  });

  it("aktive Karte nicht in der Liste: roher Slot-Index gekappt", () => {
    expect(gapIndexToInsertAfterDetach(sibs, "x", 2)).toBe(2);
  });
});

describe("insertIndexBelowCardAmongSiblings", () => {
  const sibs = [node("a"), node("b"), node("c")];

  it("fügt unter Zielkarte ein (Mitte)", () => {
    expect(insertIndexBelowCardAmongSiblings(sibs, "b", "a")).toBe(1);
  });

  it("fügt am Ende ein, wenn Ziel die letzte Karte ist", () => {
    expect(insertIndexBelowCardAmongSiblings(sibs, "a", "c")).toBe(2);
  });

  it("Ziel nicht in Liste → ans Ende", () => {
    expect(insertIndexBelowCardAmongSiblings(sibs, "a", "x")).toBe(2);
  });

  it("aktive Karte aus Liste herausgerechnet, dann Index unter Ziel", () => {
    const four = [...sibs, node("d")];
    expect(insertIndexBelowCardAmongSiblings(four, "b", "a")).toBe(1);
    expect(insertIndexBelowCardAmongSiblings(four, "a", "d")).toBe(3);
  });
});

describe("applyMindmapDrop — Hauptebene / Wurzeln", () => {
  it("Lücke ans Ende der Wurzel-Liste (columnGap)", () => {
    const roots = [node("a"), node("b"), node("c")];
    const next = applyMindmapDrop(roots, [], "b", gap(0, 3, null));
    expect(shape(next)).toBe("a()c()b()");
  });

  it("gleiche Spalte: Drop auf Wurzelkarte nestet unter die Zielkarte", () => {
    const roots = [node("a"), node("b"), node("c")];
    const next = applyMindmapDrop(roots, [], "a", card("c", 0, null));
    expect(shape(next)).toBe("b()c(a())");
  });

  it("andere Spalte: Kind auf Wurzelkarte → Hochziehen als Geschwister unter Ziel", () => {
    const roots = [node("a", [node("x")]), node("b")];
    const next = applyMindmapDrop(roots, [], "x", card("b", 0, null));
    expect(shape(next)).toBe("a()b()x()");
  });

  it("listParentId muss bei Spalte 0 null sein", () => {
    const roots = [node("a"), node("b")];
    const unchanged = applyMindmapDrop(roots, [], "a", card("b", 0, "bogus"));
    expect(unchanged).toBe(roots);
  });
});

describe("applyMindmapDrop — Lücken (Sortieren in der Spalte)", () => {
  it("Kinder von p per Lücke umsortieren", () => {
    const roots = [node("p", [node("a"), node("b"), node("c")])];
    const next = applyMindmapDrop(roots, ["p"], "a", gap(1, 2, "p"));
    expect(shape(next)).toBe("p(b()a()c())");
  });

  it("Spalte unter a: Lücke mit listParentId a (Pfad p→a)", () => {
    const roots = [node("p", [node("a", [node("x"), node("y")])])];
    const next = applyMindmapDrop(roots, ["p", "a"], "y", gap(2, 0, "a"));
    expect(shape(next)).toBe("p(a(y()x()))");
  });

  it("falsches listParentId für Spalte wird abgelehnt", () => {
    const roots = [node("p", [node("a")])];
    const u = applyMindmapDrop(roots, ["p"], "a", gap(1, 0, null));
    expect(u).toBe(roots);
  });
});

describe("applyMindmapDrop — gleiche Spalte: Karte = Nest", () => {
  it("Geschwister in Spalte 1: Zielkarte → Kind der Zielkarte", () => {
    const roots = [node("p", [node("a"), node("b"), node("c")])];
    const next = applyMindmapDrop(roots, ["p"], "a", card("c", 1, "p"));
    expect(shape(next)).toBe("p(b()c(a()))");
  });

  it("letztes Geschwister als Ziel → Nest unter diesem", () => {
    const roots = [node("p", [node("a"), node("b")])];
    const next = applyMindmapDrop(roots, ["p"], "a", card("b", 1, "p"));
    expect(shape(next)).toBe("p(b(a()))");
  });
});

describe("applyMindmapDrop — Nest unter Zielkarte (anderer Listen-Kontext)", () => {
  it("Karte wird letztes Kind der Zielkarte (bestehende Kinder bleiben davor)", () => {
    const roots = [
      node("a", [node("x")]),
      node("b", [node("y")]),
    ];
    const next = applyMindmapDrop(roots, [], "x", card("b", 1, null));
    expect(shape(next)).toBe("a()b(y()x())");
  });

  it("Nest unter Karte mit anderem Eltern-Knoten", () => {
    const roots = [node("p", [node("a")]), node("q", [node("b")])];
    const next = applyMindmapDrop(roots, ["p", "q"], "a", card("b", 2, "q"));
    expect(shape(next)).toBe("p()q(b(a()))");
  });
});

describe("applyMindmapDrop — Ablehnungen (Zyklus, Kontext, Identität)", () => {
  it("kein Drop auf sich selbst", () => {
    const roots = [node("a"), node("b")];
    const u = applyMindmapDrop(roots, [], "a", card("a", 0, null));
    expect(u).toBe(roots);
  });

  it("kein Nest unter eigenem Nachfahren", () => {
    const roots = [node("a", [node("b", [node("c")])])];
    const u = applyMindmapDrop(roots, ["a", "b"], "a", card("c", 2, "b"));
    expect(u).toBe(roots);
  });

  it("listParentId passt nicht zum tatsächlichen Eltern der Zielkarte", () => {
    const roots = [node("p", [node("a")]), node("q", [node("b")])];
    const u = applyMindmapDrop(roots, ["q"], "a", card("b", 1, "p"));
    expect(u).toBe(roots);
  });

  it("Spalte 0 nur für echte Wurzelkarten (nicht für Kind mit columnIndex 0)", () => {
    const roots = [node("p", [node("child")])];
    const u = applyMindmapDrop(roots, [], "child", {
      kind: "card",
      cardId: "child",
      columnIndex: 0,
      listParentId: null,
    });
    expect(u).toBe(roots);
  });
});

describe("applyMindmapDrop — Teilbaum bleibt intakt", () => {
  it("structuredClone: Kinder der verschobenen Karte bleiben erhalten", () => {
    const roots = [node("a", [node("x", [node("deep")])]), node("b")];
    const next = applyMindmapDrop(roots, [], "x", card("b", 0, null));
    const moved = next.find((r) => r.id === "x");
    expect(moved?.children.map((c) => c.id)).toEqual(["deep"]);
  });
});

describe("buildMindmapDropPreview — konsistent mit erlaubten Drops", () => {
  const roots = [
    node("a", [node("x")]),
    node("b", [node("y"), node("z")]),
  ];
  const pathRoots: string[] = [];
  const pathUnderB = ["b"];

  it("Lücke ans Ende der Wurzeln → column-end", () => {
    const p = buildMindmapDropPreview(roots, pathRoots, "x", gap(0, roots.length, null));
    expect(p).toMatchObject({
      activeId: "x",
      intent: "column-end",
      targetMode: "column",
      toCol: 0,
      insertIndex: roots.length,
    });
  });

  it("Wurzel auf Wurzel gleiche Spalte → nest-under", () => {
    const r = [node("a"), node("b")];
    const p = buildMindmapDropPreview(r, pathRoots, "a", card("b", 0, null));
    expect(p).toMatchObject({ intent: "nest-under", anchorCardId: "b" });
  });

  it("Kind auf Wurzel (andere Spalte) → root-sibling", () => {
    const p = buildMindmapDropPreview(roots, pathRoots, "x", card("b", 0, null));
    expect(p).toMatchObject({ intent: "root-sibling", anchorCardId: "b" });
  });

  it("gleiche Spalte unter b: y auf z → nest-under", () => {
    const p = buildMindmapDropPreview(roots, pathUnderB, "y", card("z", 1, "b"));
    expect(p).toMatchObject({ intent: "nest-under", anchorCardId: "z" });
  });

  it("andere Spalte: Wurzel a auf z unter b → nest-under", () => {
    const nest = buildMindmapDropPreview(roots, pathUnderB, "a", card("z", 1, "b"));
    expect(nest).toMatchObject({ intent: "nest-under", anchorCardId: "z" });
  });

  it("Zyklus → kein Preview", () => {
    const deep = [node("root", [node("mid", [node("leaf")])])];
    expect(buildMindmapDropPreview(deep, ["root", "mid"], "root", card("leaf", 2, "mid"))).toBeNull();
  });

  it("unbekannte aktive Karte → null", () => {
    expect(buildMindmapDropPreview(roots, pathRoots, "nope", card("a", 0, null))).toBeNull();
  });

  it("Lücke in Spalte 1 → reorder-gap", () => {
    const p = buildMindmapDropPreview(roots, pathUnderB, "y", gap(1, 0, "b"));
    expect(p).toMatchObject({ intent: "reorder-gap", toCol: 1, insertIndex: 0 });
  });
});

describe("buildMindmapDropPreview — abgelehnte Ziele", () => {
  it("null wenn listParentId nicht zum Eltern der Zielkarte passt", () => {
    const roots = [node("p", [node("a")]), node("q", [node("b")])];
    expect(buildMindmapDropPreview(roots, ["q"], "a", card("b", 1, "p"))).toBeNull();
  });

  it("null bei Drop auf sich (Karten-Ziel)", () => {
    const roots = [node("a"), node("b")];
    expect(buildMindmapDropPreview(roots, [], "a", card("a", 0, null))).toBeNull();
  });
});

describe("boardColumnCount / Spalten unter Pfad-Ende", () => {
  it("zusätzliche Spalten für jede weitere Tiefe unter dem Blatt", () => {
    const roots = [node("p", [node("a", [node("x", [node("deep")])])])];
    expect(boardColumnCount(roots, ["p"])).toBe(4);
    const col2 = getColumnDisplayRows(roots, ["p"], 2).map((r) => r.node.id);
    const col3 = getColumnDisplayRows(roots, ["p"], 3).map((r) => r.node.id);
    expect(col2).toEqual(["x"]);
    expect(col3).toEqual(["deep"]);
  });

  it("nur Pfad + eine Kinderspalte wenn kein Enkel", () => {
    const roots = [node("p", [node("a"), node("b")])];
    expect(boardColumnCount(roots, ["p"])).toBe(2);
  });
});
