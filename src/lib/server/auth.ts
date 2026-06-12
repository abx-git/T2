import { createHmac, timingSafeEqual } from "node:crypto";

import { getAuthPassword, getAuthUsername, getSessionSecret, isServerBoardConfigured } from "@/lib/server/env";

export const SESSION_COOKIE_NAME = "t2_session";
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 14;

interface SessionPayload {
  u: string;
  exp: number;
}

function signPayload(encoded: string, secret: string): string {
  return createHmac("sha256", secret).update(encoded).digest("base64url");
}

export function createSessionToken(username: string): string | null {
  const secret = getSessionSecret();
  if (!secret) return null;
  const payload: SessionPayload = {
    u: username,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = signPayload(encoded, secret);
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token?.trim()) return null;
  const secret = getSessionSecret();
  if (!secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts as [string, string];
  const expected = signPayload(encoded, secret);
  try {
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
  } catch {
    return null;
  }
  if (typeof payload.u !== "string" || typeof payload.exp !== "number") return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  if (payload.u !== getAuthUsername()) return null;
  return payload.u;
}

export function verifyCredentials(username: string, password: string): boolean {
  if (!isServerBoardConfigured()) return false;
  const expectedUser = getAuthUsername();
  const expectedPass = getAuthPassword();
  if (!expectedPass) return false;
  const uOk = username.trim() === expectedUser;
  const a = Buffer.from(password);
  const b = Buffer.from(expectedPass);
  if (a.length !== b.length) return false;
  return uOk && timingSafeEqual(a, b);
}

export function sessionCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  };
}

export function readSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const part of parts) {
    if (part.startsWith(`${SESSION_COOKIE_NAME}=`)) {
      return decodeURIComponent(part.slice(SESSION_COOKIE_NAME.length + 1));
    }
  }
  return null;
}

export function getSessionUserFromRequest(req: Request): string | null {
  return verifySessionToken(readSessionCookie(req.headers.get("cookie")));
}
