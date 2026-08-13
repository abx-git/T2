import { describe, expect, it } from "vitest";

import {
  assertSafeWorkingFileWrite,
  boardContentHash,
  boardJsonHasContent,
} from "@/lib/working-file-write-fence";
import { DEFAULT_CARD_FIELD_VISIBILITY } from "@/lib/card-field-visibility";
import { buildBoardSnapshot, stringifyExportedDocument } from "@/lib/task-tree-json";
import type { TaskNode } from "@/types/task-node";

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

function nonemptyJson(title = "Workshop"): string {
  const root = node("task-1", title);
  return stringifyExportedDocument(
    buildBoardSnapshot([root], [root.id], {}, DEFAULT_CARD_FIELD_VISIBILITY, false, true),
  );
}

function emptyishJson(): string {
  return stringifyExportedDocument(
    buildBoardSnapshot([], [], {}, DEFAULT_CARD_FIELD_VISIBILITY, false, true),
  );
}

describe("working-file-write-fence", () => {
  it("hashes board content stably", () => {
    const a = nonemptyJson("A");
    expect(boardContentHash(a)).toBe(boardContentHash(a));
    expect(boardJsonHasContent(a)).toBe(true);
    expect(boardJsonHasContent("{}")).toBe(false);
  });

  it("refuses empty/default over nonempty disk", () => {
    const disk = nonemptyJson();
    const result = assertSafeWorkingFileWrite({
      outgoingJson: emptyishJson(),
      diskJson: disk,
      expectedContentHash: boardContentHash(disk),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("empty_over_nonempty");
  });

  it("refuses empty over nonempty even with skipCas", () => {
    const disk = nonemptyJson();
    const result = assertSafeWorkingFileWrite({
      outgoingJson: "",
      diskJson: disk,
      skipCas: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("empty_over_nonempty");
  });

  it("refuses content CAS mismatch", () => {
    const disk = nonemptyJson("Disk");
    const outgoing = nonemptyJson("Editor");
    const result = assertSafeWorkingFileWrite({
      outgoingJson: outgoing,
      diskJson: disk,
      expectedContentHash: boardContentHash(nonemptyJson("ExpectedOld")),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("content_cas_mismatch");
  });

  it("allows dirty editor when disk matches expected baseline", () => {
    const disk = nonemptyJson("Base");
    const expected = boardContentHash(disk);
    const outgoing = nonemptyJson("Edited");
    const result = assertSafeWorkingFileWrite({
      outgoingJson: outgoing,
      diskJson: disk,
      expectedContentHash: expected,
    });
    expect(result.ok).toBe(true);
  });

  it("allows skipCas create when disk empty", () => {
    const result = assertSafeWorkingFileWrite({
      outgoingJson: nonemptyJson(),
      diskJson: "",
      skipCas: true,
    });
    expect(result.ok).toBe(true);
  });

  it("refuses write without disk baseline when required", () => {
    const result = assertSafeWorkingFileWrite({
      outgoingJson: nonemptyJson(),
      diskJson: null,
      requireDiskBaseline: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unknown_disk_baseline");
  });
});
