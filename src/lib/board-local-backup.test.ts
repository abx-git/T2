import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  flushLocalBoardBackup,
  getLocalBoardBackupEntry,
  listLocalBoardBackups,
  pruneLocalBoardBackupEntries,
  writeLocalBoardBackup,
} from "./board-local-backup";
import { buildBoardSnapshot, stringifyExportedDocument } from "./task-tree-json";
import type { TaskNode } from "@/types/task-node";

function boardJson(title: string): string {
  const root: TaskNode = {
    id: "a",
    title,
    link: "",
    description: "",
    tags: [],
    dueDate: null,
    reminderDate: null,
    effort: 0,
    children: [],
  };
  return stringifyExportedDocument(
    buildBoardSnapshot([root], [], {}, undefined, false, true),
  );
}

describe("board-local-backup", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    });
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-28T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("stores changed snapshots within 24h", () => {
    writeLocalBoardBackup(boardJson("A"));
    vi.advanceTimersByTime(60_000);
    writeLocalBoardBackup(boardJson("B"));

    const list = listLocalBoardBackups();
    expect(list).toHaveLength(2);
    expect(list[0]?.rootCount).toBe(1);
  });

  it("skips duplicate snapshots inside the minimum interval", () => {
    writeLocalBoardBackup(boardJson("A"));
    vi.advanceTimersByTime(60_000);
    writeLocalBoardBackup(boardJson("A"));
    expect(listLocalBoardBackups()).toHaveLength(1);
  });

  it("prunes entries older than 24 hours", () => {
    const old = new Date("2026-06-27T11:00:00.000Z").toISOString();
    const recent = new Date("2026-06-28T11:00:00.000Z").toISOString();
    const pruned = pruneLocalBoardBackupEntries(
      [
        { savedAt: old, json: boardJson("Alt") },
        { savedAt: recent, json: boardJson("Neu") },
      ],
      Date.parse("2026-06-28T12:00:00.000Z"),
    );
    expect(pruned).toHaveLength(1);
    expect(pruned[0]?.savedAt).toBe(recent);
  });

  it("flush forces a snapshot even when unchanged", () => {
    writeLocalBoardBackup(boardJson("A"));
    vi.advanceTimersByTime(60_000);
    flushLocalBoardBackup(boardJson("A"));
    expect(listLocalBoardBackups()).toHaveLength(2);
  });

  it("getLocalBoardBackupEntry returns stored json", () => {
    writeLocalBoardBackup(boardJson("X"));
    const savedAt = listLocalBoardBackups()[0]!.savedAt;
    expect(getLocalBoardBackupEntry(savedAt)?.json).toContain("X");
  });
});
