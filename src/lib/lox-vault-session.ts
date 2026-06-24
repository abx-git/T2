/**
 * LOX-ID der aktiven Vault-Verknüpfung (sessionStorage — nicht in URLs).
 */

const SESSION_KEY = "t2-vault-lox-id";

export function readVaultLoxId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)?.trim();
    return raw || null;
  } catch {
    return null;
  }
}

export function writeVaultLoxId(loxId: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, loxId);
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
