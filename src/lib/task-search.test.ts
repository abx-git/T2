import { describe, expect, it } from "vitest";

import type { TaskNode } from "@/types/task-node";

import { searchTaskNodes } from "./task-search";

function node(partial: Partial<TaskNode> & Pick<TaskNode, "id" | "title">, children: TaskNode[] = []): TaskNode {
  return {
    link: "",
    description: "",
    tags: [],
    dueDate: null,
    reminderDate: null,
    effort: 0,
    children,
    ...partial,
  };
}

describe("searchTaskNodes", () => {
  const roots: TaskNode[] = [
    node(
      { id: "a", title: "Alpha Projekt", description: "Hauptthema", tags: ["work"] },
      [node({ id: "b", title: "Beta Task", description: "Details zur Beta", tags: ["urgent"] })],
    ),
    node({ id: "c", title: "Gamma", tags: ["work"] }),
  ];

  it("liefert leere Liste bei leerer Anfrage", () => {
    expect(searchTaskNodes(roots, "")).toEqual([]);
    expect(searchTaskNodes(roots, "   ")).toEqual([]);
  });

  it("findet nach Titel und filtert nach allen Wörtern", () => {
    const hits = searchTaskNodes(roots, "beta details");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.nodeId).toBe("b");
    expect(hits[0]?.breadcrumb).toBe("Alpha Projekt");
  });

  it("findet über Tags", () => {
    const hits = searchTaskNodes(roots, "urgent");
    expect(hits.map((h) => h.nodeId)).toEqual(["b"]);
  });

  it("sortiert Titel-Treffer höher", () => {
    const hits = searchTaskNodes(roots, "work");
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits[0]?.nodeId).toBe("a");
  });
});
