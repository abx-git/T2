import { describe, expect, it, afterEach } from "vitest";

import {
  clearWorkingFileSessionHydrated,
  clearWorkingFileSyncState,
  isKnownFileRevision,
  markWorkingFileSessionHydrated,
  markWorkingFileSynced,
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
