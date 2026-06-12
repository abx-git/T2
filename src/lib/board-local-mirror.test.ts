import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  flushLocalBoardMirror,
  readLocalBoardMirror,
  writeLocalBoardMirror,
} from "./board-local-mirror";
import { buildBoardSnapshot, stringifyExportedDocument } from "./task-tree-json";
import type { TaskNode } from "@/types/task-node";

function emptyBoardJson() {
  return stringifyExportedDocument(
    buildBoardSnapshot([], [], {}, undefined, false, true),
  );
}

function boardWithRoot() {
  const root: TaskNode = {
    id: "a",
    title: "Test",
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

describe("board-local-mirror", () => {
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
  });

  it("writes and reads mirror", () => {
    const json = boardWithRoot();
    writeLocalBoardMirror(json);
    const read = readLocalBoardMirror();
    expect(read?.json).toBe(json);
    expect(read?.version).toBe(1);
  });

  it("flush always updates savedAt", () => {
    writeLocalBoardMirror(emptyBoardJson());
    const first = readLocalBoardMirror()?.savedAt;
    flushLocalBoardMirror(boardWithRoot());
    const second = readLocalBoardMirror()?.savedAt;
    expect(second).toBeTruthy();
    expect(readLocalBoardMirror()?.json).toContain("Test");
    if (first && second) expect(second >= first).toBe(true);
  });
});
