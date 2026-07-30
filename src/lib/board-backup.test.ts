import { beforeEach, describe, expect, it } from "vitest";

import {
  buildBackupFilename,
  createBoardBackupNow,
  formatBackupTimestamp,
  formatLastBackupLabel,
  getLastBackupPersistKey,
  rememberBackupBaselineFromStore,
  resetLastBackupPersistKey,
  slugForBackupFilename,
} from "@/lib/board-backup";
import { useTaskTreeStore } from "@/store/task-tree-store";
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

describe("board-backup", () => {
  beforeEach(() => {
    resetLastBackupPersistKey();
    useTaskTreeStore.getState().replaceBoardFromImport({
      roots: [],
      pathIds: [],
      columnTitleOverrides: {},
    });
  });

  it("builds timestamped filenames", () => {
    const d = new Date(2026, 6, 23, 7, 5, 9); // month is 0-based
    expect(formatBackupTimestamp(d)).toBe("2026-07-23-070509");
    expect(buildBackupFilename("Mein Board", d)).toBe(
      "mein-board-backup-2026-07-23-070509.json",
    );
  });

  it("slugs titles safely", () => {
    expect(slugForBackupFilename("  Hello World!  ")).toBe("hello-world");
    expect(slugForBackupFilename("")).toBe("t2-board");
  });

  it("formats last-backup label", () => {
    expect(formatLastBackupLabel(null)).toBe("Noch kein Backup");
    expect(formatLastBackupLabel(Date.UTC(2026, 0, 1, 12, 0, 0))).toMatch(/2026/);
  });

  it("skips onlyIfChanged backups when the board is unchanged", () => {
    useTaskTreeStore.getState().replaceBoardFromImport({
      roots: [node("a", "Alpha")],
      pathIds: [],
      columnTitleOverrides: {},
    });
    rememberBackupBaselineFromStore();
    expect(getLastBackupPersistKey()).toBeTruthy();

    expect(createBoardBackupNow({ onlyIfChanged: true })).toEqual({
      skipped: true,
      reason: "unchanged",
    });

    useTaskTreeStore.getState().replaceBoardFromImport({
      roots: [node("a", "Alpha"), node("b", "Beta")],
      pathIds: [],
      columnTitleOverrides: {},
    });
    rememberBackupBaselineFromStore();
    expect(createBoardBackupNow({ onlyIfChanged: true })).toEqual({
      skipped: true,
      reason: "unchanged",
    });
  });

  it("does not skip onlyIfChanged when there is no baseline yet", () => {
    expect(getLastBackupPersistKey()).toBeNull();
    expect(createBoardBackupNow({ onlyIfChanged: true })).toEqual({
      skipped: true,
      reason: "empty",
    });
  });
});
