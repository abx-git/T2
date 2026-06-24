/**
 * LOX-ID der aktiven Vault-Verknüpfung (sessionStorage — nicht in URLs).
 */

import { canonicalBoardLoxId } from "@/lib/lox-id";

const SESSION_KEY = "t2-vault-lox-id";

export function readVaultLoxId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)?.trim();
    if (!raw) return null;
    return canonicalBoardLoxId(raw) ?? raw;
  } catch {
    return null;
  }
}

export function writeVaultLoxId(loxId: string): void {
  if (typeof window === "undefined") return;
  try {
    const canonical = canonicalBoardLoxId(loxId) ?? loxId.trim();
    sessionStorage.setItem(SESSION_KEY, canonical);
  } catch {
    /* privater Modus */
  }
}

export function clearVaultLoxId(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
