/**
 * Automatische Browser-Kopie des Board-Standes (localStorage — auch ohne HTTPS).
 * Überlebt Tab-Schließen und Browser-Neustart; kein manuelles Backup nötig.
 */

import { boardExportTextsEquivalent } from "@/lib/task-tree-json";

const STORAGE_KEY = "t2-board-local-mirror-v1";

export interface LocalBoardMirrorV1 {
  version: 1;
  savedAt: string;
  json: string;
}

export function readLocalBoardMirror(): LocalBoardMirrorV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalBoardMirrorV1;
    if (parsed?.version !== 1 || typeof parsed.json !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeLocalBoardMirror(json: string): void {
  if (typeof window === "undefined") return;
  const prev = readLocalBoardMirror();
  if (prev && boardExportTextsEquivalent(prev.json, json)) return;
  try {
    const state: LocalBoardMirrorV1 = {
      version: 1,
      savedAt: new Date().toISOString(),
      json,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* Speicher voll / privater Modus */
  }
}

/** Sofort speichern (Tab schließen, App in den Hintergrund). */
export function flushLocalBoardMirror(json: string): void {
  if (typeof window === "undefined") return;
  try {
    const state: LocalBoardMirrorV1 = {
      version: 1,
      savedAt: new Date().toISOString(),
      json,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function clearLocalBoardMirror(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
