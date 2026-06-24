import { NextResponse } from "next/server";

import { isVaultConfigured } from "@/lib/server/env";
import {
  normalizeVaultLoxId,
  parseVaultAuthHeader,
  vaultStorageKeyForLoxId,
} from "@/lib/server/vault-validation";
import { checkVaultRateLimit } from "@/lib/server/vault-rate-limit";

export function vaultNotConfiguredResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "vault_not_configured",
      message: "LOX-Vault ist auf diesem Host nicht aktiv (T2_VAULT_ENABLED=0).",
    },
    { status: 503 },
  );
}

export function requireVaultConfigured(): NextResponse | null {
  if (!isVaultConfigured()) return vaultNotConfiguredResponse();
  return null;
}

export function vaultUnauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export function vaultRateLimitedResponse(): NextResponse {
  return NextResponse.json({ error: "rate_limited" }, { status: 429 });
}

export function requireVaultLoxId(req: Request): string | NextResponse {
  const cfg = requireVaultConfigured();
  if (cfg) return cfg;

  const raw = parseVaultAuthHeader(req.headers.get("authorization"));
  if (!raw) return vaultUnauthorizedResponse();

  const storageKey = vaultStorageKeyForLoxId(raw);
  if (!storageKey) return vaultUnauthorizedResponse();

  if (!checkVaultRateLimit(req, storageKey)) return vaultRateLimitedResponse();

  return storageKey;
}

export function normalizeVaultLoxIdFromRequest(req: Request): string | null {
  const raw = parseVaultAuthHeader(req.headers.get("authorization"));
  if (!raw) return null;
  return normalizeVaultLoxId(raw);
}
