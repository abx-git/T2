import path from "node:path";

/** `T2_VAULT_ENABLED=0` — Host liefert nur die App; kein Vault-API. */
export function isVaultFeatureEnabled(): boolean {
  const raw = process.env.T2_VAULT_ENABLED?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return true;
}

export function isVaultConfigured(): boolean {
  return isVaultFeatureEnabled();
}

export function getVaultDirPath(): string {
  const raw = process.env.T2_VAULT_DIR_PATH?.trim();
  if (raw) return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
  return path.join(process.cwd(), "data", "vaults");
}

export function getVaultMaxBytes(): number {
  const raw = process.env.T2_VAULT_MAX_BYTES?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 8 * 1024 * 1024;
  return Number.isFinite(n) && n > 0 ? n : 8 * 1024 * 1024;
}
