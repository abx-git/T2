import { describe, expect, it } from "vitest";

import {
  deriveStorageDisplayStatus,
  formatStorageStatusTooltip,
  formatFooterSaveButtonTitle,
  footerSaveIconIsUnsaved,
  hasUnsavedWorkingFile,
  dataStorageButtonClassName,
} from "./storage-coordinator";

const base = {
  workingFileLabel: null,
  workingFileAttached: false,
  workingFileDirty: false,
  workingFileSaving: false,
  fsAccessSupported: true,
};

describe("deriveStorageDisplayStatus", () => {
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

describe("footerSaveIconIsUnsaved", () => {
  it("is unsaved when dirty or no file", () => {
    expect(footerSaveIconIsUnsaved("dirty")).toBe(true);
    expect(footerSaveIconIsUnsaved("no-file")).toBe(true);
    expect(footerSaveIconIsUnsaved("saved")).toBe(false);
    expect(footerSaveIconIsUnsaved("saving")).toBe(false);
  });
});

describe("formatFooterSaveButtonTitle", () => {
  it("tells the user to click to save", () => {
    const dirty = deriveStorageDisplayStatus({
      ...base,
      workingFileAttached: true,
      workingFileLabel: "board.json",
      workingFileDirty: true,
    });
    expect(formatFooterSaveButtonTitle(dirty)).toContain("klicken zum Speichern");
  });
});
