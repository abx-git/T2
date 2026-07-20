import { describe, expect, it } from "vitest";

import type { TaskNode } from "@/types/task-node";

import { mergeCardFieldVisibility } from "./card-field-visibility";
import { isLoxTaskId } from "./task-id";
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  boardExportTextsEquivalent,
  buildBoardSnapshot,
  buildSubtreeSnapshot,
  isBoardSnapshot,
  isSubtreeSnapshot,
  parseExportedDocument,
  remapTaskNodeIds,
  stringifyExportedDocument,
  taskNodeFromJson,
  taskNodeToJson,
} from "./task-tree-json";

function sampleNode(id: string): TaskNode {
  return {
    id,
    title: `T-${id}`,
    link: "https://example.org/doc",
    description: "d",
    tags: ["A"],
    dueDate: new Date("2026-03-15T12:00:00.000Z"),
    reminderDate: null,
    effort: 2,
    children: [
      {
        id: `${id}-c`,
        title: "Child",
        link: "",
        description: "",
        tags: ["In Arbeit"],
        dueDate: null,
        reminderDate: null,
        effort: 0,
        children: [],
      },
    ],
  };
}

function collectIds(n: TaskNode): string[] {
  return [n.id, ...n.children.flatMap((c) => collectIds(c))];
}

describe("task-tree-json", () => {
  it("roundtrips task node with dates via JSON", () => {
    const n = sampleNode("a");
    const back = taskNodeFromJson(taskNodeToJson(n));
    expect(back.id).toBe(n.id);
    expect(back.title).toBe(n.title);
    expect(back.link).toBe("https://example.org/doc");
    expect(back.dueDate?.toISOString()).toBe(n.dueDate?.toISOString());
    expect(back.children[0].tags).toEqual(["In Arbeit"]);
  });

  it("roundtrips optional cardColor", () => {
    const n: TaskNode = { ...sampleNode("c"), cardColor: "emerald" };
    const back = taskNodeFromJson(taskNodeToJson(n));
    expect(back.cardColor).toBe("emerald");
    const plain = taskNodeFromJson(taskNodeToJson(sampleNode("d")));
    expect(plain.cardColor).toBeUndefined();
  });

  it("boardExportTextsEquivalent ignores exportedAt", () => {
    const roots: TaskNode[] = [sampleNode("r1")];
    const snap = buildBoardSnapshot(roots, [], {}, mergeCardFieldVisibility({}), false, true);
    const a = stringifyExportedDocument(snap);
    const b = stringifyExportedDocument({ ...snap, exportedAt: "2020-01-01T00:00:00.000Z" });
    expect(a).not.toBe(b);
    expect(boardExportTextsEquivalent(a, b)).toBe(true);
  });

  it("remapTaskNodeIds assigns fresh ids for whole subtree", () => {
    const n = sampleNode("root");
    const orig = new Set(collectIds(n));
    const m = remapTaskNodeIds(n);
    const next = new Set(collectIds(m));
    expect(next.size).toBe(orig.size);
    for (const id of next) {
      expect(orig.has(id)).toBe(false);
      expect(isLoxTaskId(id)).toBe(true);
    }
    expect(m.title).toBe(n.title);
    expect(m.children).toHaveLength(1);
  });

  it("parses board v1 and legacy roots-only", () => {
    const roots: TaskNode[] = [sampleNode("r1")];
    const doc = buildBoardSnapshot(roots, ["r1"], { 0: "Ebene A" }, mergeCardFieldVisibility({}), false, true);
    const text = stringifyExportedDocument(doc);
    const parsed = parseExportedDocument(text);
    expect(isBoardSnapshot(parsed)).toBe(true);
    if (isBoardSnapshot(parsed)) {
      expect(parsed.format).toBe(EXPORT_FORMAT);
      expect(parsed.version).toBe(EXPORT_VERSION);
      expect(parsed.roots).toHaveLength(1);
    }

    const legacy = JSON.stringify({ roots: [taskNodeToJson(sampleNode("legacy"))] });
    const p2 = parseExportedDocument(legacy);
    expect(isBoardSnapshot(p2)).toBe(true);
    if (isBoardSnapshot(p2)) {
      expect(p2.pathIds).toEqual([]);
    }
  });

  it("parses subtree export", () => {
    const sub = buildSubtreeSnapshot(sampleNode("s"));
    const text = stringifyExportedDocument(sub);
    const parsed = parseExportedDocument(text);
    expect(isSubtreeSnapshot(parsed)).toBe(true);
    if (isSubtreeSnapshot(parsed)) {
      expect(parsed.root.id).toBe("s");
    }
  });

  it("roundtrips board cardFieldVisibility in JSON", () => {
    const roots: TaskNode[] = [sampleNode("r1")];
    const vis = mergeCardFieldVisibility({ description: false, effort: false, completedCheck: false });
    const doc = buildBoardSnapshot(roots, [], {}, vis, false, true);
    const text = stringifyExportedDocument(doc);
    const parsed = parseExportedDocument(text);
    expect(isBoardSnapshot(parsed)).toBe(true);
    if (isBoardSnapshot(parsed)) {
      expect(parsed.cardFieldVisibility?.description).toBe(false);
      expect(parsed.cardFieldVisibility?.effort).toBe(false);
      expect(parsed.cardFieldVisibility?.completedCheck).toBe(false);
      expect(parsed.cardFieldVisibility?.tags).toBe(true);
    }
  });

  it("migrates legacy status-only node on import", () => {
    const legacyNode = {
      id: "x",
      title: "T",
      description: "",
      status: "done" as const,
      dueDate: null,
      reminderDate: null,
      effort: 0,
      children: [],
    };
    const n = taskNodeFromJson(legacyNode);
    expect(n.tags.map((t) => t.toLowerCase())).toContain("erledigt");
  });

  it("rejects invalid JSON", () => {
    expect(() => parseExportedDocument("{")).toThrow();
    expect(() => parseExportedDocument("{}")).toThrow();
  });
});
