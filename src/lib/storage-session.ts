/**
 * Aktiver Speichermodus — überlebt Tab-Neustart (sessionStorage).
 */

export type StorageMode = "browser" | "file" | "server";

const SESSION_KEY = "t2-storage-mode";

export function readStorageMode(): StorageMode {
  if (typeof window === "undefined") return "browser";
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw === "file" || raw === "server") return raw;
    return "browser";
  } catch {
    return "browser";
  }
}

export function writeStorageMode(mode: StorageMode): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, mode);
  } catch {
    /* privater Modus */
  }
}
