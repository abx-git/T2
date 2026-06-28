import { describe, expect, it } from "vitest";

import {
  deriveStorageDisplayStatus,
  formatStorageRelativeTime,
  formatStorageStatusTooltip,
  hasUnsavedPrimaryTarget,
  resolveAutoSaveTarget,
  storageModeFromFlags,
} from "./storage-coordinator";

describe("storageModeFromFlags", () => {
  it("prefers server when connected", () => {
    expect(
      storageModeFromFlags({ serverBoardEnabled: true, workingFileAttached: true }),
    ).toBe("server");
  });

  it("keeps server mode for offline draft", () => {
    expect(
      storageModeFromFlags({
        serverBoardEnabled: false,
        workingFileAttached: false,
        serverOfflinePending: true,
      }),
    ).toBe("server");
  });

  it("uses file when server off", () => {
    expect(
      storageModeFromFlags({ serverBoardEnabled: false, workingFileAttached: true }),
    ).toBe("file");
  });

  it("falls back to browser", () => {
    expect(
      storageModeFromFlags({ serverBoardEnabled: false, workingFileAttached: false }),
    ).toBe("browser");
  });
});

describe("resolveAutoSaveTarget", () => {
  it("maps server offline pending to server target", () => {
    expect(
      resolveAutoSaveTarget({
        serverBoardEnabled: false,
        workingFileAttached: false,
        serverOfflinePending: true,
      }),
    ).toBe("server");
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
      storageMode: "server",
      serverBoardDirty: true,
    });
    expect(s.tone).toBe("dirty");
    expect(s.secondaryLine).toContain("Tab nicht schließen");
  });

  it("shows offline draft under server mode", () => {
    const s = deriveStorageDisplayStatus({
      ...base,
      storageMode: "server",
      serverOfflinePending: true,
    });
    expect(s.tone).toBe("offline");
    expect(s.primaryLine).toContain("Offline-Entwurf");
  });

  it("shows browser-only default", () => {
    const s = deriveStorageDisplayStatus({
      ...base,
      storageMode: "browser",
    });
    expect(s.tone).toBe("local-only");
    expect(s.primaryLine).toBe("Nur im Browser");
  });
});

describe("hasUnsavedPrimaryTarget", () => {
  it("warns only for active dirty targets", () => {
    expect(
      hasUnsavedPrimaryTarget({
        storageMode: "file",
        workingFileDirty: true,
        serverBoardDirty: false,
      }),
    ).toBe(true);
    expect(
      hasUnsavedPrimaryTarget({
        storageMode: "browser",
        workingFileDirty: true,
        serverBoardDirty: true,
      }),
    ).toBe(false);
  });
});

describe("formatStorageStatusTooltip", () => {
  it("joins primary, secondary and action hint", () => {
    const status = deriveStorageDisplayStatus({
      storageMode: "server",
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
    expect(tip).toContain("Gespeichert — Server (LOX-ID)");
    expect(tip).toContain("Browser-Notfallkopie");
    expect(tip).toContain("Klick:");
  });
});

describe("formatStorageRelativeTime", () => {
  it("returns gerade eben for recent", () => {
    const now = Date.parse("2026-05-28T12:00:05Z");
    expect(formatStorageRelativeTime("2026-05-28T12:00:00Z", now)).toBe("gerade eben");
  });
});
