import { defaultLoxIdService } from "@/lib/lox-id";

const VAULT_AUTH_RE = /^Vault\s+(.+)$/i;

export function parseVaultAuthHeader(header: string | null | undefined): string | null {
  if (!header?.trim()) return null;
  const match = header.match(VAULT_AUTH_RE);
  if (!match?.[1]) return null;
  return match[1].trim();
}

export function normalizeVaultLoxId(raw: string): string | null {
  const normalized = defaultLoxIdService.normalizeId(raw.trim());
  if (!defaultLoxIdService.validateId(normalized)) return null;
  return normalized;
}

export function vaultStorageKeyForLoxId(loxId: string): string | null {
  const normalized = normalizeVaultLoxId(loxId);
  return normalized;
}
