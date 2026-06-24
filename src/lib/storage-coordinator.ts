/**
 * Einheitlicher Speicher-Status für Arbeitsziel, Server und lokale Notfall-Kopie.
 */

export type AutoSaveTarget = "local" | "working-file" | "server";

export type StorageStatusTone = "saved" | "dirty" | "saving" | "offline" | "local-only";

export interface StorageCoordinatorInput {
  autoSaveTarget: AutoSaveTarget;
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
  /** „Jetzt speichern“ anzeigen (nur bei dirty + Auto-Save-Ziel). */
  showFlushAction: boolean;
}

export function resolveAutoSaveTarget(input: {
  serverBoardEnabled: boolean;
  workingFileAttached: boolean;
}): AutoSaveTarget {
  if (input.serverBoardEnabled) return "server";
  if (input.workingFileAttached) return "working-file";
  return "local";
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

  if (input.autoSaveTarget === "server") {
    if (input.serverBoardSaving) {
      return {
        tone: "saving",
        primaryLine: "Speichert auf Server …",
        secondaryLine: null,
        showFlushAction: false,
      };
    }
    if (input.serverBoardDirty) {
      return {
        tone: "dirty",
        primaryLine: "Ungespeichert — Server",
        secondaryLine: "Änderungen werden automatisch hochgeladen",
        showFlushAction: true,
      };
    }
    return {
      tone: "saved",
      primaryLine: "Gespeichert — Server (LOX-Vault)",
      secondaryLine: mirrorHint ? `Notfall-Kopie im Browser ${mirrorHint}` : null,
      showFlushAction: false,
    };
  }

  if (input.autoSaveTarget === "working-file") {
    const label = input.workingFileLabel?.trim() || "Arbeitsdatei";
    if (input.workingFileSaving) {
      return {
        tone: "saving",
        primaryLine: `Speichert in „${label}“ …`,
        secondaryLine: null,
        showFlushAction: false,
      };
    }
    if (input.workingFileDirty) {
      return {
        tone: "dirty",
        primaryLine: `Ungespeichert — ${label}`,
        secondaryLine: "Änderungen werden automatisch in die Datei geschrieben",
        showFlushAction: true,
      };
    }
    return {
      tone: "saved",
      primaryLine: `Gespeichert — ${label}`,
      secondaryLine: mirrorHint ? `Notfall-Kopie im Browser ${mirrorHint}` : null,
      showFlushAction: false,
    };
  }

  if (input.serverOfflinePending) {
    const offlineSecondary = input.serverBoardAutoPaused
      ? "Kein Netz — Abgleich mit Server sobald online"
      : "Offline-Entwurf — unter „Daten“ mit Server verbinden";
    return {
      tone: "offline",
      primaryLine: "Nur in diesem Browser (Offline-Entwurf)",
      secondaryLine: offlineSecondary,
      showFlushAction: false,
    };
  }

  return {
    tone: "local-only",
    primaryLine: "Nur in diesem Browser",
    secondaryLine: mirrorHint
      ? `Notfall-Kopie ${mirrorHint} — kein Auto-Speichern in Datei oder Server`
      : "Kein Auto-Speichern in Datei oder Server — unter „Daten“ Ziel wählen",
    showFlushAction: false,
  };
}

/** Mehrzeiliger Tooltip für den „Daten“-Button (Mouseover). */
export function formatStorageStatusTooltip(status: StorageDisplayStatus): string {
  const lines = [status.primaryLine];
  if (status.secondaryLine) lines.push(status.secondaryLine);
  lines.push("Klick: Daten & Speicher öffnen");
  return lines.join("\n");
}
