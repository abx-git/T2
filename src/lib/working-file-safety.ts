/**
 * Lightweight gates for Arbeitsdatei writes.
 * Identity is `wf` only — missing URL is healed by rebind; mismatch is blocked.
 */

import { readWorkingFileIdFromUrl } from "@/lib/working-file-tab-context";

export type WorkingFileWriteBlockReason =
  | "not_attached"
  | "not_writer"
  | "url_context_mismatch";

export interface WorkingFileWriteGate {
  ok: boolean;
  reason?: WorkingFileWriteBlockReason;
  message?: string;
  /** Caller should re-bind wf into the URL, then retry. */
  shouldRebindUrl?: boolean;
}

/**
 * Whether cold-start may auto-restore a remembered file.
 * URL `?wf=` / session wf, or legacy `?filename=` / session label — never shared localStorage alone.
 */
export function mayAutoRestoreWorkingFileFromStorage(): boolean {
  if (readWorkingFileIdFromUrl()) return true;
  try {
    if (typeof window !== "undefined") {
      const legacyName = new URLSearchParams(window.location.search).get("filename")?.trim();
      if (legacyName) return true;
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof sessionStorage === "undefined") return false;
    const raw = sessionStorage.getItem("t2.working-file.tab-context");
    if (!raw) return false;
    const parsed = JSON.parse(raw) as {
      wf?: string;
      label?: string;
      filename?: string;
    };
    return Boolean(
      parsed.wf?.trim() || parsed.label?.trim() || parsed.filename?.trim(),
    );
  } catch {
    return false;
  }
}

/**
 * Soft URL check: missing `wf` → rebind (not a hard block).
 * Hard block only on wf mismatch.
 */
export function evaluateWorkingFileWriteGate(input: {
  attached: boolean;
  isWriterLeader: boolean;
  activeWf: string | null;
  label?: string | null;
  requireWriter?: boolean;
}): WorkingFileWriteGate {
  if (!input.attached) {
    return { ok: false, reason: "not_attached", message: "Keine Arbeitsdatei verknüpft." };
  }

  if (input.requireWriter !== false && !input.isWriterLeader) {
    return {
      ok: false,
      reason: "not_writer",
      message: "Dieser Tab schreibt die Datei gerade nicht (anderer Tab ist aktiv).",
    };
  }

  const urlWf = readWorkingFileIdFromUrl();
  const activeWf = input.activeWf?.trim() || null;

  if (!urlWf) {
    return { ok: true, shouldRebindUrl: true };
  }

  if (activeWf && urlWf !== activeWf) {
    return {
      ok: false,
      reason: "url_context_mismatch",
      message: "URL und verknüpfte Datei stimmen nicht überein.",
    };
  }

  return { ok: true };
}
