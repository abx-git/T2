/**
 * Speicher-Status für die Datei-basierte Persistenz.
 */

export type StorageStatusTone = "saved" | "dirty" | "saving" | "no-file" | "unsupported";

export interface StorageDisplayStatus {
  tone: StorageStatusTone;
  primaryLine: string;
  secondaryLine: string | null;
}

export interface StorageCoordinatorInput {
  workingFileLabel: string | null;
  workingFileAttached: boolean;
  workingFileDirty: boolean;
  workingFileSaving: boolean;
  fsAccessSupported: boolean;
  mobileWorkingFileMode?: boolean;
}

export function deriveStorageDisplayStatus(input: StorageCoordinatorInput): StorageDisplayStatus {
  if (!input.fsAccessSupported) {
    return {
      tone: "unsupported",
      primaryLine: "Datei-API nicht verfügbar",
      secondaryLine: "Chrome, Edge oder Brave mit https:// oder localhost",
    };
  }

  if (!input.workingFileAttached) {
    return {
      tone: "no-file",
      primaryLine: "Keine Arbeitsdatei",
      secondaryLine: "Bitte eine JSON-Datei öffnen oder anlegen",
    };
  }

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
      secondaryLine: "Wird gleich in die Datei geschrieben — Tab nicht schließen",
    };
  }

  return {
    tone: "saved",
    primaryLine: `Gespeichert — ${label}`,
    secondaryLine: input.mobileWorkingFileMode
      ? "Lokal zwischengespeichert — für Proton Drive unter „Daten & Speicher“ exportieren"
      : "Änderungen am Board werden automatisch in die Datei geschrieben",
  };
}

export function hasUnsavedWorkingFile(workingFileDirty: boolean, workingFileAttached: boolean): boolean {
  return workingFileAttached && workingFileDirty;
}

export function formatStorageStatusTooltip(status: StorageDisplayStatus): string {
  const lines = [status.primaryLine];
  if (status.secondaryLine) lines.push(status.secondaryLine);
  lines.push("Klick: Daten & Speicher öffnen");
  return lines.join("\n");
}

const DATA_STORAGE_BUTTON_BASE =
  "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 transition";

export function dataStorageButtonClassName(tone: StorageStatusTone): string {
  if (tone === "saved") {
    return `${DATA_STORAGE_BUTTON_BASE} border-emerald-200/90 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 hover:text-emerald-900`;
  }
  return `${DATA_STORAGE_BUTTON_BASE} border-slate-200/90 bg-slate-50/80 text-slate-600 hover:bg-white hover:text-slate-900`;
}
