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

/** Footer save icon is red unless the working file is currently saved. */
export function footerSaveIconIsUnsaved(tone: StorageStatusTone): boolean {
  return tone === "dirty" || tone === "no-file";
}

export function formatFooterSaveButtonTitle(status: StorageDisplayStatus): string {
  if (status.tone === "saving") return "Speichert …";
  if (status.tone === "dirty") return "Ungespeichert — klicken zum Speichern";
  if (status.tone === "saved") return "Gespeichert — klicken zum Speichern";
  return `${status.primaryLine} — klicken zum Speichern unter…`;
}

const DATA_STORAGE_BUTTON_BASE =
  "flex h-8 items-center gap-1.5 rounded-lg px-2 transition";

export function dataStorageButtonClassName(tone: StorageStatusTone): string {
  if (tone === "saved") {
    return `${DATA_STORAGE_BUTTON_BASE} bg-emerald-50 text-emerald-800 hover:bg-emerald-100 hover:text-emerald-900`;
  }
  if (tone === "dirty" || tone === "saving") {
    return `${DATA_STORAGE_BUTTON_BASE} bg-amber-50 text-amber-900 hover:bg-amber-100`;
  }
  if (tone === "no-file" || tone === "unsupported") {
    return `${DATA_STORAGE_BUTTON_BASE} bg-sky-50 text-sky-900 hover:bg-sky-100`;
  }
  return `${DATA_STORAGE_BUTTON_BASE} text-slate-600 hover:bg-slate-100 hover:text-slate-900`;
}
