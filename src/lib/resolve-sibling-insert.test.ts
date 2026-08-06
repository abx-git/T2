import { describe, expect, it } from "vitest";

import { resolveSiblingInsertAfterId } from "@/lib/tree-utils";
import type { TaskNode } from "@/types/task-node";

function card(
  id: string,
  children: TaskNode[] = [],
  extra: Partial<TaskNode> = {},
): TaskNode {
  return {
    id,
    title: id,
    link: "",
    description: "",
    tags: [],
    dueDate: null,
    reminderDate: null,
    effort: 0,
    children,
    ...extra,
  };
}

function note(id: string, children: TaskNode[] = []): TaskNode {
  return card(id, children, { kind: "note", markdown: id, title: "" });
}

describe("resolveSiblingInsertAfterId", () => {
  it("returns the focused card", () => {
    const roots = [card("a"), card("b")];
    expect(resolveSiblingInsertAfterId(roots, "b")).toBe("b");
  });

  it("for a note uses the preceding card sibling", () => {
    const roots = [card("a"), note("n1"), note("n2"), card("b")];
    expect(resolveSiblingInsertAfterId(roots, "n1")).toBe("a");
    expect(resolveSiblingInsertAfterId(roots, "n2")).toBe("a");
  });

  it("for a nested note without preceding card sibling uses the parent card", () => {
    const roots = [card("a", [note("n"), card("c")])];
    expect(resolveSiblingInsertAfterId(roots, "n")).toBe("a");
  });

  it("for a root note without a card above uses the note itself", () => {
    const roots = [note("n"), card("a")];
    expect(resolveSiblingInsertAfterId(roots, "n")).toBe("n");
  });

  it("returns null for unknown ids", () => {
    expect(resolveSiblingInsertAfterId([card("a")], "missing")).toBeNull();
  });
});
