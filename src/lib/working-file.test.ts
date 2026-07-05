import { describe, expect, it, afterEach } from "vitest";

import {
  clearWorkingFileSyncState,
  isKnownFileRevision,
  markWorkingFileSynced,
} from "./working-file";

describe("isKnownFileRevision", () => {
  afterEach(() => {
    clearWorkingFileSyncState();
  });

  it("is true for the last synced revision", () => {
    markWorkingFileSynced("{}", 12345);
    expect(isKnownFileRevision(12345)).toBe(true);
    expect(isKnownFileRevision(12346)).toBe(false);
  });

  it("is false before any sync", () => {
    expect(isKnownFileRevision(1)).toBe(false);
  });
});
