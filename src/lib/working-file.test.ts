import { describe, expect, it, afterEach } from "vitest";

import {
  clearWorkingFileSessionHydrated,
  clearWorkingFileSyncState,
  isKnownFileRevision,
  markWorkingFileSessionHydrated,
  markWorkingFileSynced,
  normalizeImportedFileText,
  suggestedWorkingFileName,
  userFacingFileReadError,
  wasWorkingFileSessionHydrated,
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

describe("normalizeImportedFileText", () => {
  it("strips UTF-8 BOM", () => {
    expect(normalizeImportedFileText("\uFEFF{\"a\":1}")).toBe("{\"a\":1}");
  });
});

describe("suggestedWorkingFileName", () => {
  it("keeps existing .json names", () => {
    expect(suggestedWorkingFileName("board.json")).toBe("board.json");
  });

  it("slugs free-text titles", () => {
    expect(suggestedWorkingFileName("Mein Board")).toBe("mein-board.json");
  });
});

describe("userFacingFileReadError", () => {
  it("translates NotReadableError for cloud storage", () => {
    const err = new DOMException(
      "The requested file could not be read, typically due to permission problems",
      "NotReadableError",
    );
    const msg = userFacingFileReadError(err);
    expect(msg).toContain("Proton Drive");
    expect(msg).toContain("Downloads");
  });
});


describe("working file session", () => {
  afterEach(() => {
    clearWorkingFileSyncState();
    clearWorkingFileSessionHydrated();
  });

  it("tracks hydration once per tab session", () => {
    expect(wasWorkingFileSessionHydrated()).toBe(false);
    markWorkingFileSessionHydrated();
    expect(wasWorkingFileSessionHydrated()).toBe(true);
    clearWorkingFileSessionHydrated();
    expect(wasWorkingFileSessionHydrated()).toBe(false);
  });
});
