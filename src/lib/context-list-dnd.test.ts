import { describe, expect, it } from "vitest";

import { applyContextListDrop } from "@/lib/context-list-dnd";
import type { TaskNode } from "@/types/task-node";

function node(id: string, title: string, children: TaskNode[] = []): TaskNode {
  return {
    id,
    title,
    link: "",
    description: "",
    tags: [],
    dueDate: null,
    reminderDate: null,
    effort: 0,
    children,
  };
}

describe("applyContextListDrop", () => {
  it("reorders siblings via gap", () => {
    const roots = [node("a", "A"), node("b", "B"), node("c", "C")];
    const next = applyContextListDrop(roots, null, "c", { kind: "gap", insertIndex: 0 });
    expect(next.map((n) => n.id)).toEqual(["c", "a", "b"]);
  });

  it("nests under a peer", () => {
    const roots = [node("a", "A"), node("b", "B")];
    const next = applyContextListDrop(roots, null, "b", { kind: "nest", targetId: "a" });
    expect(next.map((n) => n.id)).toEqual(["a"]);
    expect(next[0].children.map((n) => n.id)).toEqual(["b"]);
  });
});
