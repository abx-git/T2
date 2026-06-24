/**
 * Vault-API-Basis-URL (Same-Origin oder NEXT_PUBLIC_T2_VAULT_API_URL).
 */

function normalizeBase(url: string): string {
  return url.trim().replace(/\/$/, "");
}

export function getVaultApiBase(): string {
  const envUrl =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_T2_VAULT_API_URL?.trim() : "";
  if (envUrl) return normalizeBase(envUrl);

  if (typeof window !== "undefined") {
    const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
    return `${window.location.origin}${basePath}`;
  }

  return "";
}

export function vaultApiUrl(path: string): string {
  const base = getVaultApiBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export function isVaultApiConfigured(): boolean {
  const envUrl =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_T2_VAULT_API_URL?.trim() : "";
  if (envUrl) return true;
  if (typeof process !== "undefined" && process.env.T2_BUILD_TARGET === "static") return false;
  return true;
}
