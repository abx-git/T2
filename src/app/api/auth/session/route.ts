import { NextResponse } from "next/server";

import { getSessionUserFromRequest } from "@/lib/server/auth";
import { isServerBoardConfigured } from "@/lib/server/env";

export async function GET(req: Request) {
  if (!isServerBoardConfigured()) {
    return NextResponse.json({ configured: false, authenticated: false });
  }
  const user = getSessionUserFromRequest(req);
  return NextResponse.json({
    configured: true,
    authenticated: Boolean(user),
    username: user ?? undefined,
  });
}
