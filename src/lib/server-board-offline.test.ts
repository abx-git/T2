import { describe, expect, it } from "vitest";

import { planServerBoardReconcile } from "./server-board-offline";
import { boardExportTextsEquivalent, buildBoardSnapshot, stringifyExportedDocument } from "./task-tree-json";
import type { TaskNode } from "@/types/task-node";

function snap(roots: TaskNode[]) {
  return stringifyExportedDocument(
    buildBoardSnapshot(roots, [], {}, { id: true, description: true, tags: true, effort: true, dueDate: true, reminderDate: true }, false, true),
  );
}

function node(id: string, title: string): TaskNode {
  return {
    id,
    title,
    link: "",
    description: "",
    tags: [],
    dueDate: null,
    reminderDate: null,
    effort: 0,
    children: [],
  };
}

describe("planServerBoardReconcile", () => {
  const base = snap([node("a", "Base")]);
  const local = snap([node("a", "Local edit")]);
  const remote = snap([node("a", "Remote edit")]);

  it("in_sync when local equals remote", () => {
    expect(planServerBoardReconcile(base, base, base).action).toBe("in_sync");
  });

  it("apply_remote when only server changed since baseline", () => {
    expect(planServerBoardReconcile(base, remote, base).action).toBe("apply_remote");
  });

  it("push_local when only local changed since baseline", () => {
    expect(planServerBoardReconcile(local, base, base).action).toBe("push_local");
  });

  it("conflict when both diverged", () => {
    expect(planServerBoardReconcile(local, remote, base).action).toBe("conflict");
  });

  it("boardExportTextsEquivalent sanity", () => {
    const a = snap([node("x", "T")]);
    const b = stringifyExportedDocument({
      ...JSON.parse(a),
      exportedAt: "2000-01-01T00:00:00.000Z",
    });
    expect(boardExportTextsEquivalent(a, b)).toBe(true);
  });
});
