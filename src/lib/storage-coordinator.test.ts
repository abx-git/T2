import { describe, expect, it } from "vitest";

import {
  deriveStorageDisplayStatus,
  formatStorageStatusTooltip,
  hasUnsavedWorkingFile,
  dataStorageButtonClassName,
} from "./storage-coordinator";

describe("deriveStorageDisplayStatus", () => {
  const base = {
    workingFileLabel: null,
    workingFileAttached: false,
    workingFileDirty: false,
    workingFileSaving: false,
    fsAccessSupported: true,
  };

  it("shows no-file when nothing attached", () => {
    const s = deriveStorageDisplayStatus(base);
    expect(s.tone).toBe("no-file");
    expect(s.primaryLine).toContain("Keine Arbeitsdatei");
  });

  it("shows dirty file state", () => {
    const s = deriveStorageDisplayStatus({
      ...base,
      workingFileAttached: true,
      workingFileLabel: "board.json",
      workingFileDirty: true,
    });
    expect(s.tone).toBe("dirty");
  });

  it("shows saved file state", () => {
    const s = deriveStorageDisplayStatus({
      ...base,
      workingFileAttached: true,
      workingFileLabel: "board.json",
    });
    expect(s.tone).toBe("saved");
    expect(s.primaryLine).toContain("board.json");
  });
});

describe("hasUnsavedWorkingFile", () => {
  it("warns only when attached and dirty", () => {
    expect(hasUnsavedWorkingFile(true, true)).toBe(true);
    expect(hasUnsavedWorkingFile(true, false)).toBe(false);
    expect(hasUnsavedWorkingFile(false, true)).toBe(false);
  });
});

describe("formatStorageStatusTooltip", () => {
  it("includes action hint", () => {
    const status = deriveStorageDisplayStatus({
      workingFileLabel: "t2-board.json",
      workingFileAttached: true,
      workingFileDirty: false,
      workingFileSaving: false,
      fsAccessSupported: true,
    });
    const tip = formatStorageStatusTooltip(status);
    expect(tip).toContain("Klick:");
  });
});

describe("dataStorageButtonClassName", () => {
  it("uses emerald styling when saved", () => {
    expect(dataStorageButtonClassName("saved")).toContain("bg-emerald-50");
  });
});
