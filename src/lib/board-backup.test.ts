import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  backupBeforeSuspiciousSwitch,
  boardNeedsSafetyBackup,
  buildBackupFilename,
  createBoardBackupNow,
  formatBackupTimestamp,
  formatLastBackupLabel,
  getLastBackupPersistKey,
  rememberBackupBaselineFromStore,
  resetLastBackupPersistKey,
  resetSuspiciousSwitchBackupDebounce,
  slugForBackupFilename,
  writeBackupHistoryMode,
} from "@/lib/board-backup";
import { useTaskTreeStore } from "@/store/task-tree-store";
import type { TaskNode } from "@/types/task-node";

vi.mock("@/lib/working-file", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/working-file")>();
  return {
    ...actual,
    isWorkingFileAttached: vi.fn(() => false),
    isWorkingFileDirty: vi.fn(() => false),
  };
});

import { isWorkingFileAttached, isWorkingFileDirty } from "@/lib/working-file";

const mockAttached = vi.mocked(isWorkingFileAttached);
const mockDirty = vi.mocked(isWorkingFileDirty);

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
    resetSuspiciousSwitchBackupDebounce();
    mockAttached.mockReturnValue(false);
    mockDirty.mockReturnValue(false);
    writeBackupHistoryMode("history");
    useTaskTreeStore.getState().replaceBoardFromImport({
      roots: [],
      pathIds: [],
      columnTitleOverrides: {},
    });
  });

  it("builds timestamped filenames for history mode", () => {
    const d = new Date(2026, 6, 23, 7, 5, 9); // month is 0-based
    expect(formatBackupTimestamp(d)).toBe("2026-07-23-070509");
    expect(buildBackupFilename("Mein Board", d, "history")).toBe(
      "mein-board-backup-2026-07-23-070509.json",
    );
  });

  it("builds a stable filename for rolling mode", () => {
    const d = new Date(2026, 6, 23, 7, 5, 9);
    expect(buildBackupFilename("Mein Board", d, "rolling")).toBe("mein-board-backup.json");
  });

  it("slugs titles safely", () => {
    expect(slugForBackupFilename("  Hello World!  ")).toBe("hello-world");
    expect(slugForBackupFilename("")).toBe("t2-board");
  });

  it("formats last-backup label", () => {
    expect(formatLastBackupLabel(null)).toBe("Noch kein Backup");
    expect(formatLastBackupLabel(Date.UTC(2026, 0, 1, 12, 0, 0))).toMatch(/2026/);
  });

  it("needs safety backup only when unsaved content exists", () => {
    expect(boardNeedsSafetyBackup()).toBe(false);

    useTaskTreeStore.getState().replaceBoardFromImport({
      roots: [node("a", "Alpha")],
      pathIds: [],
      columnTitleOverrides: {},
    });
    expect(boardNeedsSafetyBackup()).toBe(true);

    mockAttached.mockReturnValue(true);
    mockDirty.mockReturnValue(false);
    expect(boardNeedsSafetyBackup()).toBe(false);

    mockDirty.mockReturnValue(true);
    expect(boardNeedsSafetyBackup()).toBe(true);
  });

  it("skips switch backup when already saved", async () => {
    useTaskTreeStore.getState().replaceBoardFromImport({
      roots: [node("a", "Alpha")],
      pathIds: [],
      columnTitleOverrides: {},
    });
    mockAttached.mockReturnValue(true);
    mockDirty.mockReturnValue(false);
    expect(await backupBeforeSuspiciousSwitch("file")).toEqual({
      skipped: true,
      reason: "already_saved",
    });
    expect(await backupBeforeSuspiciousSwitch("import")).toEqual({
      skipped: true,
      reason: "already_saved",
    });
  });

  it("skips onlyIfChanged backups when the board is unchanged", async () => {
    useTaskTreeStore.getState().replaceBoardFromImport({
      roots: [node("a", "Alpha")],
      pathIds: [],
      columnTitleOverrides: {},
    });
    rememberBackupBaselineFromStore();
    expect(getLastBackupPersistKey()).toBeTruthy();

    expect(await createBoardBackupNow({ onlyIfChanged: true })).toEqual({
      skipped: true,
      reason: "unchanged",
    });

    useTaskTreeStore.getState().replaceBoardFromImport({
      roots: [node("a", "Alpha"), node("b", "Beta")],
      pathIds: [],
      columnTitleOverrides: {},
    });
    rememberBackupBaselineFromStore();
    expect(await createBoardBackupNow({ onlyIfChanged: true })).toEqual({
      skipped: true,
      reason: "unchanged",
    });
  });

  it("does not skip onlyIfChanged when there is no baseline yet", async () => {
    expect(getLastBackupPersistKey()).toBeNull();
    expect(await createBoardBackupNow({ onlyIfChanged: true })).toEqual({
      skipped: true,
      reason: "empty",
    });
  });
});
