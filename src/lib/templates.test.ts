import { beforeEach, describe, expect, it } from "vitest";

import {
  clearTemplatesForTests,
  countInsertCards,
  mergeTemplateLibraries,
  setTemplatesCacheForTests,
  templateFromSubtree,
  templateOutlineLines,
} from "@/lib/templates";
import { remapTaskNodeForest, remapTaskNodeIds } from "@/lib/task-tree-json";
import type { TaskNode } from "@/types/task-node";

function node(
  partial: Partial<TaskNode> & Pick<TaskNode, "id" | "title">,
  children: TaskNode[] = [],
): TaskNode {
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

describe("mergeTemplateLibraries", () => {
  it("keeps newer updatedAt for same id", () => {
    const older = {
      id: "a",
      name: "Alt",
      updatedAt: 1,
      root: { id: "r", title: "R", description: "", dueDate: null, reminderDate: null, effort: 0, children: [] },
    };
    const newer = { ...older, name: "Neu", updatedAt: 2 };
    const merged = mergeTemplateLibraries([older], [newer]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.name).toBe("Neu");
  });

  it("unions distinct ids", () => {
    const a = templateFromSubtree(node({ id: "1", title: "A" }), "A", { id: "t1", updatedAt: 1 });
    const b = templateFromSubtree(node({ id: "2", title: "B" }), "B", { id: "t2", updatedAt: 2 });
    expect(mergeTemplateLibraries([a], [b])).toHaveLength(2);
  });
});

describe("countInsertCards / outline", () => {
  const root = templateFromSubtree(
    node({ id: "p", title: "Aufnahme" }, [
      node({ id: "c1", title: "Antrag" }),
      node({ id: "c2", title: "Beitrag" }),
    ]),
    "Mitgliederaufnahme",
  ).root;

  it("counts children mode as sum of child trees", () => {
    expect(countInsertCards(root, "children")).toBe(2);
    expect(countInsertCards(root, "wrapper")).toBe(3);
  });

  it("leaf template inserts one card in children mode", () => {
    const leaf = templateFromSubtree(node({ id: "x", title: "Solo" }), "Solo").root;
    expect(countInsertCards(leaf, "children")).toBe(1);
  });

  it("outline for children omits wrapper title", () => {
    const lines = templateOutlineLines(root, "children");
    expect(lines[0]).toBe("Antrag");
    expect(lines).not.toContain("Aufnahme");
  });
});

describe("remapTaskNodeIds with taken", () => {
  it("avoids ids already in taken set", () => {
    const taken = new Set<string>();
    const first = remapTaskNodeIds(node({ id: "old", title: "A" }), taken);
    const second = remapTaskNodeIds(node({ id: "old2", title: "B" }), taken);
    expect(first.id).not.toBe(second.id);
    expect(taken.has(first.id)).toBe(true);
    expect(taken.has(second.id)).toBe(true);
  });

  it("remapTaskNodeForest keeps ids unique across roots", () => {
    const forest = remapTaskNodeForest([
      node({ id: "a", title: "A" }),
      node({ id: "b", title: "B" }),
    ]);
    expect(forest[0]!.id).not.toBe(forest[1]!.id);
  });
});

describe("template cache helpers", () => {
  beforeEach(async () => {
    await clearTemplatesForTests();
  });

  it("setTemplatesCacheForTests populates snapshot helpers", () => {
    const rec = templateFromSubtree(node({ id: "1", title: "X" }), "X", { id: "tid" });
    setTemplatesCacheForTests([rec]);
    expect(countInsertCards(rec.root, "wrapper")).toBe(1);
  });
});
