import { describe, expect, it } from "vitest";

import {
  deriveStorageDisplayStatus,
  formatStorageRelativeTime,
  formatStorageStatusTooltip,
  resolveAutoSaveTarget,
} from "./storage-coordinator";

describe("resolveAutoSaveTarget", () => {
  it("prefers server over working file", () => {
    expect(
      resolveAutoSaveTarget({ serverBoardEnabled: true, workingFileAttached: true }),
    ).toBe("server");
  });

  it("uses working file when server off", () => {
    expect(
      resolveAutoSaveTarget({ serverBoardEnabled: false, workingFileAttached: true }),
    ).toBe("working-file");
  });

  it("falls back to local", () => {
    expect(
      resolveAutoSaveTarget({ serverBoardEnabled: false, workingFileAttached: false }),
    ).toBe("local");
  });
});

describe("deriveStorageDisplayStatus", () => {
  const base = {
    workingFileLabel: null,
    workingFileDirty: false,
    workingFileSaving: false,
    serverBoardDirty: false,
    serverBoardSaving: false,
    serverOfflinePending: false,
    serverBoardAutoPaused: false,
    localMirrorSavedAt: null,
  };

  it("shows dirty server state", () => {
    const s = deriveStorageDisplayStatus({
      ...base,
      autoSaveTarget: "server",
      serverBoardDirty: true,
    });
    expect(s.tone).toBe("dirty");
    expect(s.showFlushAction).toBe(true);
  });

  it("shows offline draft", () => {
    const s = deriveStorageDisplayStatus({
      ...base,
      autoSaveTarget: "local",
      serverOfflinePending: true,
    });
    expect(s.tone).toBe("offline");
  });
});

describe("formatStorageStatusTooltip", () => {
  it("joins primary, secondary and action hint", () => {
    const status = deriveStorageDisplayStatus({
      autoSaveTarget: "server",
      workingFileLabel: null,
      workingFileDirty: false,
      workingFileSaving: false,
      serverBoardDirty: false,
      serverBoardSaving: false,
      serverOfflinePending: false,
      serverBoardAutoPaused: false,
      localMirrorSavedAt: new Date().toISOString(),
    });
    const tip = formatStorageStatusTooltip(status);
    expect(tip).toContain("Gespeichert — Server (LOX-Vault)");
    expect(tip).toContain("24h-Notfall-Sicherung");
    expect(tip).toContain("Klick:");
  });
});

describe("formatStorageRelativeTime", () => {
  it("returns gerade eben for recent", () => {
    const now = Date.parse("2026-05-28T12:00:05Z");
    expect(formatStorageRelativeTime("2026-05-28T12:00:00Z", now)).toBe("gerade eben");
  });
});
