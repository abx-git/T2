import { beforeEach, describe, expect, it } from "vitest";

import {
  clearBoardHistory,
  redoBoard,
  runWithoutBoardHistory,
  undoBoard,
  useTaskTreeStore,
} from "@/store/task-tree-store";

describe("board undo/redo", () => {
  beforeEach(() => {
    runWithoutBoardHistory(() => {
      useTaskTreeStore.getState().replaceBoardFromImport({
        roots: [],
        pathIds: [],
        collapsedIds: [],
        columnTitleOverrides: {},
        clipboardRoots: [],
      });
    });
  });

  it("undoes and redoes card creation", () => {
    const id = useTaskTreeStore.getState().addCardAfter(null);
    expect(useTaskTreeStore.getState().roots).toHaveLength(1);
    expect(useTaskTreeStore.temporal.getState().pastStates.length).toBeGreaterThan(0);

    undoBoard();
    expect(useTaskTreeStore.getState().roots).toHaveLength(0);
    expect(useTaskTreeStore.getState().roots.find((n) => n.id === id)).toBeUndefined();

    redoBoard();
    expect(useTaskTreeStore.getState().roots).toHaveLength(1);
    expect(useTaskTreeStore.getState().roots[0]?.id).toBe(id);
  });

  it("does not record drill-only navigation", () => {
    const parentId = useTaskTreeStore.getState().addCardAfter(null);
    useTaskTreeStore.getState().updateCard(parentId, { title: "Parent" });
    const childId = useTaskTreeStore.getState().addCardAfter(parentId);
    useTaskTreeStore.getState().updateCard(childId, { title: "Child" });
    clearBoardHistory();

    useTaskTreeStore.getState().drillIntoNode(parentId);
    expect(useTaskTreeStore.getState().contextNodeId).toBe(parentId);
    expect(useTaskTreeStore.temporal.getState().pastStates).toHaveLength(0);

    useTaskTreeStore.getState().drillUp();
    expect(useTaskTreeStore.getState().contextNodeId).toBeNull();
    expect(useTaskTreeStore.temporal.getState().pastStates).toHaveLength(0);
  });

  it("clears history when loading a board without tracking", () => {
    useTaskTreeStore.getState().addCardAfter(null);
    expect(useTaskTreeStore.temporal.getState().pastStates.length).toBeGreaterThan(0);

    runWithoutBoardHistory(() => {
      useTaskTreeStore.getState().replaceBoardFromImport({
        roots: [
          {
            id: "AAAA-BBBB",
            title: "Loaded",
            link: "",
            description: "",
            tags: [],
            dueDate: null,
            reminderDate: null,
            effort: 0,
            children: [],
          },
        ],
        pathIds: [],
        collapsedIds: [],
        columnTitleOverrides: {},
      });
    });

    expect(useTaskTreeStore.getState().roots[0]?.title).toBe("Loaded");
    expect(useTaskTreeStore.temporal.getState().pastStates).toHaveLength(0);
    expect(useTaskTreeStore.temporal.getState().futureStates).toHaveLength(0);
  });
});
