import { afterEach, describe, expect, it } from "vitest";

import {
  createAlwaysLeaderFileWriter,
  createFileTabWriter,
  ensureWorkingFileWriter,
  getActiveWorkingFileWriterName,
  isWorkingFileWriterLeader,
  lockNameForWorkingFile,
  stopWorkingFileWriter,
} from "@/lib/working-file-writer";

describe("working-file-writer", () => {
  afterEach(() => {
    stopWorkingFileWriter();
  });

  it("builds a stable lock name from filename", () => {
    expect(lockNameForWorkingFile("Alpha.storm.json")).toBe(
      "t2-working-file-writer:alpha.storm.json",
    );
    expect(lockNameForWorkingFile("WF-UUID-1")).toBe("t2-working-file-writer:wf-uuid-1");
  });

  it("always-leader helper reports leader after start", () => {
    const w = createAlwaysLeaderFileWriter();
    expect(w.isLeader()).toBe(true);
    w.start();
    expect(w.getRole()).toBe("leader");
    w.stop();
    expect(w.getRole()).toBe("follower");
  });

  it("createFileTabWriter starts and stops cleanly", () => {
    const w = createFileTabWriter("demo.storm.json");
    w.start();
    expect(["leader", "follower"]).toContain(w.getRole());
    w.stop();
    expect(w.isLeader()).toBe(false);
  });

  it("module writer defaults to leader when no file is attached", () => {
    expect(isWorkingFileWriterLeader()).toBe(true);
    expect(getActiveWorkingFileWriterName()).toBe(null);
  });

  it("ensureWorkingFileWriter tracks the active filename", () => {
    ensureWorkingFileWriter("a.storm.json");
    expect(getActiveWorkingFileWriterName()).toBe("a.storm.json");
    ensureWorkingFileWriter("b.storm.json");
    expect(getActiveWorkingFileWriterName()).toBe("b.storm.json");
    stopWorkingFileWriter();
    expect(getActiveWorkingFileWriterName()).toBe(null);
    expect(isWorkingFileWriterLeader()).toBe(true);
  });
});
