import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { reconcileInitialServerBoard } from "./server-board-reconcile";
import {
  buildBoardSnapshot,
  stringifyExportedDocument,
} from "./task-tree-json";
import type { TaskNode } from "@/types/task-node";

const writeBoardToServer = vi.fn();
const markServerBoardSynced = vi.fn();
const applyBoardJsonToStore = vi.fn(() => true);

vi.mock("@/lib/server-board", () => ({
  getLastSyncedBoardJson: vi.fn(() => null),
  isBoardFetchOk: (result: { status: string }) => result.status === "ok",
  markServerBoardSynced: (...args: unknown[]) => markServerBoardSynced(...args),
  writeBoardToServer: (...args: unknown[]) => writeBoardToServer(...args),
}));

vi.mock("@/lib/server-board-offline", () => ({
  applyBoardJsonToStore: (...args: unknown[]) => applyBoardJsonToStore(...args),
  clearOfflinePauseState: vi.fn(),
  planServerBoardReconcile: vi.fn(),
  readOfflinePauseState: vi.fn(() => null),
}));

function snap(roots: TaskNode[]) {
  return stringifyExportedDocument(
    buildBoardSnapshot(
      roots,
      [],
      {},
      { id: true, description: true, tags: true, effort: true, dueDate: true, reminderDate: true },
      false,
      true,
    ),
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

describe("reconcileInitialServerBoard", () => {
  beforeEach(() => {
    writeBoardToServer.mockReset();
    markServerBoardSynced.mockReset();
    applyBoardJsonToStore.mockReset();
    applyBoardJsonToStore.mockReturnValue(true);
    vi.stubGlobal("window", {
      confirm: vi.fn(() => true),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("connect: lädt Server-Stand bei leerem lokalen Board", async () => {
    const remote = snap([node("a", "Remote")]);
    const result = await reconcileInitialServerBoard(
      "",
      { status: "ok", text: remote, etag: '"x"', lastModified: 1 },
      "connect",
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.action).toBe("apply_remote");
    expect(writeBoardToServer).not.toHaveBeenCalled();
    expect(applyBoardJsonToStore).toHaveBeenCalledWith(remote);
  });

  it("connect: überschreibt Server nicht bei leerem Remote", async () => {
    const local = snap([node("a", "Local")]);
    const result = await reconcileInitialServerBoard(local, { status: "missing" }, "connect");

    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(writeBoardToServer).not.toHaveBeenCalled();
  });

  it("connect: meldet ungültige LOX-ID separat", async () => {
    const local = snap([node("a", "Local")]);
    const result = await reconcileInitialServerBoard(local, { status: "unauthorized" }, "connect");

    expect(result).toEqual({ ok: false, reason: "unauthorized" });
    expect(writeBoardToServer).not.toHaveBeenCalled();
  });

  it("connect: überschreibt Server nicht bei Konflikt-Abbruch", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    const local = snap([node("a", "Local")]);
    const remote = snap([node("b", "Remote")]);
    const result = await reconcileInitialServerBoard(
      local,
      { status: "ok", text: remote, etag: '"x"', lastModified: 1 },
      "connect",
    );

    expect(result).toEqual({ ok: false, reason: "cancelled" });
    expect(writeBoardToServer).not.toHaveBeenCalled();
  });

  it("create: legt Board auf leerem Server an", async () => {
    writeBoardToServer.mockResolvedValue('"etag"');
    const local = snap([node("a", "Local")]);
    const result = await reconcileInitialServerBoard(local, { status: "missing" }, "create");

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.action).toBe("push_local");
    expect(writeBoardToServer).toHaveBeenCalledWith(local, null);
  });
});
