/**
 * Hard gates before truncating a working-file `.json`.
 * Prevents empty/default boards and stale CAS from wiping nonempty disk content.
 */

import {
  boardImportPayloadFromExportText,
  stableBoardStateKey,
  type BoardImportPayload,
} from "@/lib/task-tree-json";

export type WorkingFileWriteFenceReason =
  | "ok"
  | "empty_over_nonempty"
  | "content_cas_mismatch"
  | "unknown_disk_baseline";

export type WorkingFileWriteFenceResult =
  | { ok: true }
  | { ok: false; reason: Exclude<WorkingFileWriteFenceReason, "ok">; message: string };

function documentHasContent(doc: BoardImportPayload): boolean {
  return doc.roots.length > 0 || (doc.clipboardRoots?.length ?? 0) > 0;
}

/** Stable content fingerprint for CAS (ignores exportedAt / viewport noise). */
export function boardContentHash(json: string): string | null {
  const trimmed = json.trim();
  if (!trimmed) return "";
  const payload = boardImportPayloadFromExportText(trimmed);
  if (!payload) return null;
  return stableBoardStateKey(payload);
}

export function boardJsonHasContent(json: string): boolean {
  const trimmed = json.trim();
  if (!trimmed) return false;
  const payload = boardImportPayloadFromExportText(trimmed);
  return Boolean(payload && documentHasContent(payload));
}

export interface AssertSafeWorkingFileWriteInput {
  outgoingJson: string;
  /** Current on-disk text (required unless skipCas for explicit Save As / Create). */
  diskJson?: string | null;
  /** Hash of the last known synced disk content (editor baseline). */
  expectedContentHash?: string | null;
  /** When true (Save As / Create after picker), content-CAS is skipped — empty-over-nonempty still blocked if diskJson provided. */
  skipCas?: boolean;
  /** If we have no disk snapshot and no baseline, refuse (unless skipCas). */
  requireDiskBaseline?: boolean;
}

/**
 * Decide whether truncating the Arbeitsdatei with `outgoingJson` is safe.
 * Call before `createWritable({ keepExistingData: false })`.
 */
export function assertSafeWorkingFileWrite(
  input: AssertSafeWorkingFileWriteInput,
): WorkingFileWriteFenceResult {
  const outgoing = input.outgoingJson;
  const disk = input.diskJson ?? null;
  const diskKnown = disk !== null && disk !== undefined;

  if (diskKnown && boardJsonHasContent(disk) && !boardJsonHasContent(outgoing)) {
    return {
      ok: false,
      reason: "empty_over_nonempty",
      message:
        "Leerer oder inhaltsloser Stand wird nicht über eine nicht-leere Arbeitsdatei geschrieben.",
    };
  }

  if (input.skipCas) {
    return { ok: true };
  }

  if (!diskKnown) {
    if (input.requireDiskBaseline !== false) {
      return {
        ok: false,
        reason: "unknown_disk_baseline",
        message: "Dateistand unbekannt — Speichern abgebrochen (kein Überschreiben ohne Basis).",
      };
    }
    return { ok: true };
  }

  const diskHash = boardContentHash(disk);
  const expected = input.expectedContentHash;

  // If we know what we last synced and disk differs, refuse (other tab / browser / editor).
  if (expected != null && expected !== "" && diskHash != null && diskHash !== expected) {
    return {
      ok: false,
      reason: "content_cas_mismatch",
      message:
        "Die Datei wurde außerhalb dieses Tabs geändert. Lokal nicht überschrieben — Speichern unter… oder Datei neu laden.",
    };
  }

  // Without expected + nonempty disk: refuse if outgoing differs (no known sync baseline).
  if ((expected == null || expected === "") && boardJsonHasContent(disk)) {
    const outHash = boardContentHash(outgoing);
    if (outHash != null && diskHash != null && outHash !== diskHash) {
      return {
        ok: false,
        reason: "unknown_disk_baseline",
        message:
          "Kein bekannter Sync-Stand zur Datei — Speichern abgebrochen. Bitte Datei neu öffnen oder Speichern unter…",
      };
    }
  }

  return { ok: true };
}
