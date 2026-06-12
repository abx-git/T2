import { describe, expect, it } from "vitest";

import {
  DEFAULT_SUBTREE_EXPORT_ATTRIBUTES,
  exportSubtreeBranch,
  taskSubtreeToBranchJson,
  taskSubtreeToHeadingMarkdown,
} from "@/lib/subtree-branch-export";
import { DEFAULT_COMPLETED_TAG } from "@/lib/task-tags";
import { parseExportedDocument, isSubtreeSnapshot } from "@/lib/task-tree-json";
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

const baseOpts = {
  format: "markdown" as const,
  attributes: { ...DEFAULT_SUBTREE_EXPORT_ATTRIBUTES },
  completedTag: DEFAULT_COMPLETED_TAG,
  effortOnTasksEnabled: true,
};

describe("taskSubtreeToHeadingMarkdown", () => {
  it("uses heading levels for hierarchy", () => {
    const root = node(
      { id: "p", title: "Parent", link: "https://example.org/p" },
      [node({ id: "c", title: "Child", description: "Notiz" })],
    );
    const md = taskSubtreeToHeadingMarkdown(root, baseOpts);
    expect(md).toMatch(/^# \[Parent\]\(https:\/\/example\.org\/p\)/m);
    expect(md).toContain("## Child");
    expect(md).toContain("> Notiz");
    expect(md).not.toContain("\t-");
  });

  it("omits unchecked attributes", () => {
    const root = node({ id: "x", title: "Nur Titel", description: "hidden", tags: ["A"] });
    const md = taskSubtreeToHeadingMarkdown(root, {
      ...baseOpts,
      attributes: { ...DEFAULT_SUBTREE_EXPORT_ATTRIBUTES, description: false, tags: false },
    });
    expect(md).toContain("# Nur Titel");
    expect(md).not.toContain("> hidden");
    expect(md).not.toContain("**Tags:**");
  });
});

describe("taskSubtreeToBranchJson", () => {
  it("exports filtered branch JSON", () => {
    const root = node({ id: "a", title: "A", link: "https://a.test", tags: ["X"] });
    const text = taskSubtreeToBranchJson(root, {
      format: "json",
      attributes: { ...DEFAULT_SUBTREE_EXPORT_ATTRIBUTES, id: true, description: false },
      completedTag: DEFAULT_COMPLETED_TAG,
    });
    const parsed = JSON.parse(text) as { root: { title: string; id: string; description?: string } };
    expect(parsed.root.title).toBe("A");
    expect(parsed.root.id).toBe("a");
    expect(parsed.root.description).toBeUndefined();
  });

  it("supports import-compatible subtree snapshot", () => {
    const root = node({ id: "r", title: "Root" }, [node({ id: "c", title: "C" })]);
    const text = taskSubtreeToBranchJson(root, {
      format: "json",
      attributes: DEFAULT_SUBTREE_EXPORT_ATTRIBUTES,
      completedTag: DEFAULT_COMPLETED_TAG,
      jsonImportCompatible: true,
    });
    const doc = parseExportedDocument(text);
    expect(isSubtreeSnapshot(doc)).toBe(true);
  });
});

describe("exportSubtreeBranch", () => {
  it("dispatches by format", () => {
    const root = node({ id: "1", title: "One" });
    const md = exportSubtreeBranch(root, { ...baseOpts, format: "markdown" });
    expect(md.startsWith("<!--")).toBe(true);
    const json = exportSubtreeBranch(root, { ...baseOpts, format: "json" });
    expect(json.trimStart().startsWith("{")).toBe(true);
  });
});
