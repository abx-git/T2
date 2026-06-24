import { NextResponse } from "next/server";

import { requireVaultConfigured } from "@/lib/server/api-errors";
import { vaultOptionsResponse, withVaultCors } from "@/lib/server/vault-cors";

export async function OPTIONS(req: Request) {
  return vaultOptionsResponse(req);
}

export async function GET(req: Request) {
  const cfg = requireVaultConfigured();
  if (cfg) return withVaultCors(req, cfg);
  return withVaultCors(req, NextResponse.json({ configured: true }));
}
