import { beforeEach, describe, expect, it } from "vitest";

import {
  BOARD_PANE_IDS,
  DEFAULT_PANE_CONTEXTS,
  normalizePaneContexts,
  parseContextPanePrefixedId,
  stripContextPanePrefix,
  withContextPanePrefix,
} from "@/lib/board-pane";
import {
  clearBoardHistory,
  runWithoutBoardHistory,
  useTaskTreeStore,
} from "@/store/task-tree-store";

describe("board-pane ids", () => {
  it("prefixes and strips pane ids", () => {
    expect(withContextPanePrefix("left", "context-gap:__root__|0")).toBe(
      "pane:left:context-gap:__root__|0",
    );
    expect(parseContextPanePrefixedId("pane:right:context-nest:abc")).toEqual({
      pane: "right",
      bareId: "context-nest:abc",
    });
    expect(stripContextPanePrefix("pane:left:x")).toBe("x");
    expect(stripContextPanePrefix("plain")).toBe("plain");
  });

  it("normalizes missing contexts to null", () => {
    const roots = [
      {
        id: "a",
        title: "A",
        link: "",
        description: "",
        tags: [],
        dueDate: null,
        reminderDate: null,
        effort: 0,
        children: [],
      },
    ];
    expect(
      normalizePaneContexts(roots, { left: "a", right: "gone" }),
    ).toEqual({ left: "a", right: null });
  });
});

describe("dual pane store navigation", () => {
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

  it("defaults to split on and independent pane contexts", () => {
    const s = useTaskTreeStore.getState();
    expect(s.splitViewEnabled).toBe(true);
    expect(s.activePane).toBe("left");
    expect(s.contextByPane).toEqual(DEFAULT_PANE_CONTEXTS);
    expect(BOARD_PANE_IDS).toEqual(["left", "right"]);
  });

  it("keeps left and right contexts independent", () => {
    const parentL = useTaskTreeStore.getState().addCardAfter(null);
    useTaskTreeStore.getState().updateCard(parentL, { title: "LeftParent" });
    const parentR = useTaskTreeStore.getState().addCardAfter(null);
    useTaskTreeStore.getState().updateCard(parentR, { title: "RightParent" });
    clearBoardHistory();

    useTaskTreeStore.getState().setActivePane("left");
    useTaskTreeStore.getState().drillIntoNode(parentL);
    useTaskTreeStore.getState().setActivePane("right");
    useTaskTreeStore.getState().drillIntoNode(parentR);

    const s = useTaskTreeStore.getState();
    expect(s.contextByPane.left).toBe(parentL);
    expect(s.contextByPane.right).toBe(parentR);
    expect(s.contextNodeId).toBe(parentR);
    expect(s.activePane).toBe("right");

    useTaskTreeStore.getState().setActivePane("left");
    expect(useTaskTreeStore.getState().contextNodeId).toBe(parentL);
  });

  it("normalizes both panes when a context node is removed", () => {
    const parent = useTaskTreeStore.getState().addCardAfter(null);
    useTaskTreeStore.getState().updateCard(parent, { title: "P" });
    useTaskTreeStore.getState().setContextNodeId(parent, "left");
    useTaskTreeStore.getState().setContextNodeId(parent, "right");
    useTaskTreeStore.getState().removeCard(parent);

    const s = useTaskTreeStore.getState();
    expect(s.contextByPane).toEqual({ left: null, right: null });
    expect(s.contextNodeId).toBeNull();
  });

  it("toggles split without changing contexts", () => {
    const id = useTaskTreeStore.getState().addCardAfter(null);
    useTaskTreeStore.getState().drillIntoNode(id, "left");
    useTaskTreeStore.getState().setSplitViewEnabled(false);
    expect(useTaskTreeStore.getState().splitViewEnabled).toBe(false);
    expect(useTaskTreeStore.getState().contextByPane.left).toBe(id);
    useTaskTreeStore.getState().setSplitViewEnabled(true);
    expect(useTaskTreeStore.getState().splitViewEnabled).toBe(true);
  });
});
