import { NextResponse } from "next/server";

import { getSessionUserFromRequest } from "@/lib/server/auth";
import { isServerBoardConfigured } from "@/lib/server/env";

export function notConfiguredResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "server_board_not_configured",
      message:
        "Server-Board ist nicht konfiguriert. T2_SESSION_SECRET, T2_AUTH_PASSWORD und optional T2_BOARD_FILE_PATH setzen.",
    },
    { status: 503 },
  );
}

export function requireServerBoardConfigured(): NextResponse | null {
  if (!isServerBoardConfigured()) return notConfiguredResponse();
  return null;
}

export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export function requireSessionUser(req: Request): string | NextResponse {
  const cfg = requireServerBoardConfigured();
  if (cfg) return cfg;
  const user = getSessionUserFromRequest(req);
  if (!user) return unauthorizedResponse();
  return user;
}
