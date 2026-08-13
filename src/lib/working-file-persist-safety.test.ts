import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_CARD_FIELD_VISIBILITY } from "@/lib/card-field-visibility";
import { buildBoardSnapshot, stringifyExportedDocument } from "@/lib/task-tree-json";
import {
  clearWorkingFileSyncState,
  getLastSyncedContentHash,
  isWorkingFileDirty,
  isWorkingFilePersistPaused,
  loadForeignBoardIntoEditor,
  markWorkingFileSynced,
  persistWorkingFileJson,
  setWorkingFilePersistPaused,
} from "@/lib/working-file";
import { boardContentHash } from "@/lib/working-file-write-fence";
import { useTaskTreeStore } from "@/store/task-tree-store";
import { stopWorkingFileWriter } from "@/lib/working-file-writer";
import type { TaskNode } from "@/types/task-node";

function nonemptyJson(title = "Workshop"): string {
  const root: TaskNode = {
    id: "task-1",
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
    buildBoardSnapshot([root], [root.id], {}, DEFAULT_CARD_FIELD_VISIBILITY, false, true),
  );
}

describe("working-file foreign load + pause", () => {
  afterEach(() => {
    setWorkingFilePersistPaused(false);
    clearWorkingFileSyncState();
    stopWorkingFileWriter();
    useTaskTreeStore.getState().replaceBoardFromImport({
      roots: [],
      pathIds: [],
      columnTitleOverrides: {},
    });
  });

  it("loadForeignBoardIntoEditor pauses persist and does not report dirty vs file", () => {
    const json = nonemptyJson("Backup");
    expect(loadForeignBoardIntoEditor(json, { reason: "backup" })).toBe(true);
    expect(isWorkingFilePersistPaused()).toBe(true);
    expect(useTaskTreeStore.getState().roots[0]?.title).toBe("Backup");
    expect(isWorkingFileDirty()).toBe(false);
  });

  it("persistWorkingFileJson refuses while paused", async () => {
    setWorkingFilePersistPaused(true, "foreign_load");
    const result = await persistWorkingFileJson(nonemptyJson());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("persist_paused");
  });

  it("marks content hash when synced", () => {
    const json = nonemptyJson("Synced");
    markWorkingFileSynced(json, 123);
    expect(getLastSyncedContentHash()).toBe(boardContentHash(json));
  });
});
