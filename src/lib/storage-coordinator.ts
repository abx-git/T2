/**
 * Einheitlicher Speicher-Status für die drei Modi: Browser, Datei, Server.
 */

import type { StorageMode } from "@/lib/storage-session";

/** @deprecated Alias — gleichbedeutend mit StorageMode-Mapping in der UI. */
export type AutoSaveTarget = "local" | "working-file" | "server";

export type StorageStatusTone = "saved" | "dirty" | "saving" | "offline" | "local-only";

export interface StorageCoordinatorInput {
  storageMode: StorageMode;
  workingFileLabel: string | null;
  workingFileDirty: boolean;
  workingFileSaving: boolean;
  serverBoardDirty: boolean;
  serverBoardSaving: boolean;
  serverOfflinePending: boolean;
  serverBoardAutoPaused: boolean;
  localMirrorSavedAt: string | null;
}

export interface StorageDisplayStatus {
  tone: StorageStatusTone;
  primaryLine: string;
  secondaryLine: string | null;
}

export function storageModeFromFlags(input: {
  serverBoardEnabled: boolean;
  workingFileAttached: boolean;
  serverOfflinePending?: boolean;
}): StorageMode {
  if (input.serverBoardEnabled || input.serverOfflinePending) return "server";
  if (input.workingFileAttached) return "file";
  return "browser";
}

/** @deprecated Nutze storageModeFromFlags. */
export function resolveAutoSaveTarget(input: {
  serverBoardEnabled: boolean;
  workingFileAttached: boolean;
  serverOfflinePending?: boolean;
}): AutoSaveTarget {
  const mode = storageModeFromFlags(input);
  if (mode === "server") return "server";
  if (mode === "file") return "working-file";
  return "local";
}

export function hasUnsavedPrimaryTarget(input: {
  storageMode: StorageMode;
  workingFileDirty: boolean;
  serverBoardDirty: boolean;
}): boolean {
  if (input.storageMode === "file") return input.workingFileDirty;
  if (input.storageMode === "server") return input.serverBoardDirty;
  return false;
}

export function formatStorageRelativeTime(iso: string | null, nowMs = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const diffSec = Math.floor((nowMs - t) / 1000);
  if (diffSec < 10) return "gerade eben";
  if (diffSec < 60) return `vor ${diffSec} Sek.`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} Std.`;
  return new Date(t).toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function deriveStorageDisplayStatus(input: StorageCoordinatorInput): StorageDisplayStatus {
  const mirrorHint = input.localMirrorSavedAt
    ? formatStorageRelativeTime(input.localMirrorSavedAt)
    : null;

  if (input.storageMode === "server") {
    if (input.serverOfflinePending && !input.serverBoardSaving) {
      const offlineSecondary = input.serverBoardAutoPaused
        ? "Kein Netz — Server-Abgleich sobald online"
        : "Offline-Entwurf — unter „Daten“ verbinden";
      return {
        tone: "offline",
        primaryLine: "Offline-Entwurf — Server",
        secondaryLine: offlineSecondary,
      };
    }
    if (input.serverBoardSaving) {
      return {
        tone: "saving",
        primaryLine: "Speichert auf Server …",
        secondaryLine: null,
      };
    }
    if (input.serverBoardDirty) {
      return {
        tone: "dirty",
        primaryLine: "Ungespeichert — Server",
        secondaryLine: "Wird automatisch hochgeladen — Tab nicht schließen",
      };
    }
    return {
      tone: "saved",
      primaryLine: "Gespeichert — Server (LOX-ID)",
      secondaryLine: mirrorHint ? `Browser-Notfallkopie ${mirrorHint}` : null,
    };
  }

  if (input.storageMode === "file") {
    const label = input.workingFileLabel?.trim() || "Arbeitsdatei";
    if (input.workingFileSaving) {
      return {
        tone: "saving",
        primaryLine: `Speichert in „${label}“ …`,
        secondaryLine: null,
      };
    }
    if (input.workingFileDirty) {
      return {
        tone: "dirty",
        primaryLine: `Ungespeichert — ${label}`,
        secondaryLine: "Wird automatisch in die Datei geschrieben — Tab nicht schließen",
      };
    }
    return {
      tone: "saved",
      primaryLine: `Gespeichert — ${label}`,
      secondaryLine: mirrorHint ? `Browser-Notfallkopie ${mirrorHint}` : null,
    };
  }

  return {
    tone: "local-only",
    primaryLine: "Nur im Browser",
    secondaryLine: mirrorHint
      ? `24h-Notfallkopie ${mirrorHint}`
      : "Automatische Browser-Kopie aktiv — optional Backup auf den Computer",
  };
}

export function formatStorageStatusTooltip(status: StorageDisplayStatus): string {
  const lines = [status.primaryLine];
  if (status.secondaryLine) lines.push(status.secondaryLine);
  lines.push("Klick: Daten & Speicher öffnen");
  return lines.join("\n");
}

const DATA_STORAGE_BUTTON_BASE =
  "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 transition";

/** Toolbar-Button „Daten“ — grün wenn primäres Ziel gespeichert/synchronisiert. */
export function dataStorageButtonClassName(tone: StorageStatusTone): string {
  if (tone === "saved") {
    return `${DATA_STORAGE_BUTTON_BASE} border-emerald-200/90 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 hover:text-emerald-900`;
  }
  return `${DATA_STORAGE_BUTTON_BASE} border-slate-200/90 bg-slate-50/80 text-slate-600 hover:bg-white hover:text-slate-900`;
}
