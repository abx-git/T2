import { describe, expect, it } from "vitest";

import type { TaskNode } from "@/types/task-node";

import {
  applyForestDrop,
  clipboardGapId,
  findNodeForestLocation,
  insertIntoForest,
  parseClipboardGapId,
  resolveUnifiedDragDrop,
} from "./clipboard-dnd";
import { detachNodeById } from "./tree-utils";

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

describe("clipboard-dnd", () => {
  it("roundtrips clipboard gap ids", () => {
    expect(parseClipboardGapId(clipboardGapId(null, 2))).toEqual({
      listParentId: null,
      insertIndex: 2,
    });
    expect(parseClipboardGapId(clipboardGapId("p-1", 0))).toEqual({
      listParentId: "p-1",
      insertIndex: 0,
    });
  });

  it("findNodeForestLocation distinguishes board and clipboard", () => {
    const board = [node("a", "A")];
    const clip = [node("b", "B")];
    expect(findNodeForestLocation(board, clip, "a")).toBe("board");
    expect(findNodeForestLocation(board, clip, "b")).toBe("clipboard");
    expect(findNodeForestLocation(board, clip, "x")).toBeNull();
  });

  it("moves board node to clipboard end", () => {
    const board = [node("a", "A", [node("a1", "A1")]), node("b", "B")];
    const clip: TaskNode[] = [];
    const { next: boardNext, detached } = detachNodeById(board, "a");
    expect(detached?.title).toBe("A");
    const clipNext = insertIntoForest(clip, detached!);
    expect(boardNext.map((n) => n.id)).toEqual(["b"]);
    expect(clipNext.map((n) => n.id)).toEqual(["a"]);
    expect(clipNext[0]?.children[0]?.id).toBe("a1");
  });

  it("reorders within clipboard forest", () => {
    const clip = [node("a", "A"), node("b", "B"), node("c", "C")];
    const next = applyForestDrop(clip, "c", { kind: "gap", listParentId: null, insertIndex: 0 });
    expect(next.map((n) => n.id)).toEqual(["c", "a", "b"]);
  });

  it("resolveUnifiedDragDrop routes to clipboard target", () => {
    const board = [node("a", "A")];
    const clip: TaskNode[] = [];
    expect(resolveUnifiedDragDrop("a", board, clip, "clipboard-drop-target")?.type).toBe(
      "to-clipboard-end",
    );
    expect(resolveUnifiedDragDrop("a", board, clip, clipboardGapId(null, 0))?.type).toBe(
      "to-clipboard",
    );
  });
});
