import { NextResponse } from "next/server";

import {
  createSessionToken,
  sessionCookieOptions,
  SESSION_COOKIE_NAME,
  verifyCredentials,
} from "@/lib/server/auth";
import { notConfiguredResponse, requireServerBoardConfigured } from "@/lib/server/api-errors";

export async function POST(req: Request) {
  const cfg = requireServerBoardConfigured();
  if (cfg) return cfg;

  let body: { username?: string; password?: string };
  try {
    body = (await req.json()) as { username?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!verifyCredentials(username, password)) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const token = createSessionToken(username.trim());
  if (!token) return notConfiguredResponse();

  const res = NextResponse.json({ ok: true, username: username.trim() });
  res.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  return res;
}
