import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_CARD_FIELD_VISIBILITY } from "@/lib/card-field-visibility";
import { buildBoardSnapshot, stringifyExportedDocument } from "@/lib/task-tree-json";
import {
  beginWorkingFileSwitch,
  endWorkingFileSwitch,
  isWorkingFileSwitchInProgress,
  persistWorkingFileJson,
  setWorkingFilePersistPaused,
} from "@/lib/working-file";
import { stopWorkingFileWriter } from "@/lib/working-file-writer";
import type { TaskNode } from "@/types/task-node";

function nonemptyJson(title: string): string {
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

describe("working-file open switch gate", () => {
  afterEach(() => {
    endWorkingFileSwitch();
    setWorkingFilePersistPaused(false);
    stopWorkingFileWriter();
  });

  it("blocks autosave while a file switch is in progress", async () => {
    beginWorkingFileSwitch();
    expect(isWorkingFileSwitchInProgress()).toBe(true);
    const result = await persistWorkingFileJson(nonemptyJson("OldBoard"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("persist_paused");
  });

  it("allows skipCas writes during switch (Save As / Create)", async () => {
    beginWorkingFileSwitch();
    const result = await persistWorkingFileJson(nonemptyJson("New"), { skipCas: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).not.toBe("persist_paused");
  });

  it("clears the switch gate on end", () => {
    beginWorkingFileSwitch();
    endWorkingFileSwitch();
    expect(isWorkingFileSwitchInProgress()).toBe(false);
  });
});
