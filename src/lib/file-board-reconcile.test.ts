import { describe, expect, it } from "vitest";

import {
  planFileReconcile,
  type BoardImportPayload,
} from "./file-board-reconcile";
import { buildBoardSnapshot, stringifyExportedDocument } from "./task-tree-json";
import type { TaskNode } from "@/types/task-node";

function emptyPayload(): BoardImportPayload {
  return {
    roots: [],
    pathIds: [],
    columnTitleOverrides: {},
  };
}

function payloadWithRoot(title: string): BoardImportPayload {
  const root: TaskNode = {
    id: "task-aaa",
    title,
    link: "",
    description: "",
    tags: [],
    dueDate: null,
    reminderDate: null,
    effort: 0,
    children: [],
  };
  return {
    roots: [root],
    pathIds: [root.id],
    columnTitleOverrides: {},
  };
}

function jsonFromPayload(payload: BoardImportPayload): string {
  return stringifyExportedDocument(
    buildBoardSnapshot(
      payload.roots,
      payload.pathIds,
      payload.columnTitleOverrides,
      {},
      false,
      true,
      payload.filterTags ?? [],
      undefined,
      payload.collapsedIds ?? [],
    ),
  );
}

describe("planFileReconcile", () => {
  it("detects in_sync", () => {
    const json = jsonFromPayload(emptyPayload());
    expect(planFileReconcile(json, json)).toEqual({ action: "in_sync" });
  });

  it("applies file when local is empty", () => {
    const local = jsonFromPayload(emptyPayload());
    const file = jsonFromPayload(payloadWithRoot("Aus Datei"));
    expect(planFileReconcile(local, file)).toEqual({ action: "apply_file" });
  });

  it("pushes local when file is empty", () => {
    const local = jsonFromPayload(payloadWithRoot("Lokal"));
    const file = jsonFromPayload(emptyPayload());
    expect(planFileReconcile(local, file)).toEqual({ action: "push_local" });
  });

  it("detects conflict when both differ", () => {
    const local = jsonFromPayload(payloadWithRoot("Lokal"));
    const file = jsonFromPayload(payloadWithRoot("Datei"));
    expect(planFileReconcile(local, file)).toEqual({ action: "conflict" });
  });

  it("treats exports as in_sync when only exportedAt differs", () => {
    const payload = payloadWithRoot("Gleich");
    const a = jsonFromPayload(payload);
    const b = jsonFromPayload(payload);
    expect(planFileReconcile(a, b)).toEqual({ action: "in_sync" });
  });
});

describe("boardPersistKeyFromStoreState", () => {
  it("ignores focus-only UI state", async () => {
    const { useTaskTreeStore } = await import("@/store/task-tree-store");
    const { boardPersistKeyFromStoreState } = await import("./file-board-reconcile");

    useTaskTreeStore.getState().replaceBoardFromImport({
      roots: [],
      pathIds: [],
      columnTitleOverrides: {},
    });
    const before = boardPersistKeyFromStoreState();
    useTaskTreeStore.getState().setContextNodeId(null);
    expect(boardPersistKeyFromStoreState()).toBe(before);
  });
});
