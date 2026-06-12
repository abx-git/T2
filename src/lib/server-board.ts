/**
 * Client-Helfer für Server-Board (JSON-Datei auf dem Server, Login per Session-Cookie).
 */

import { boardExportTextsEquivalent } from "@/lib/task-tree-json";

export interface AuthSessionInfo {
  configured: boolean;
  authenticated: boolean;
  username?: string;
}

export interface BoardFetchResult {
  text: string;
  etag: string;
  lastModified: number;
}

let lastSyncedBoardJson: string | null = null;
let lastKnownEtag: string | null = null;
let suppressExternalPollUntil = 0;

/** Nach eigenem PUT: externes Polling unterdrücken (länger als Poll-Intervall). */
const EXTERNAL_POLL_SUPPRESS_MS = 6000;

export function isServerBoardLinked(): boolean {
  return lastKnownEtag !== null || lastSyncedBoardJson !== null;
}

export function getLastSyncedBoardJson(): string | null {
  return lastSyncedBoardJson;
}

export function getLastKnownEtag(): string | null {
  return lastKnownEtag;
}

export function markServerBoardSynced(json: string, etag: string): void {
  lastSyncedBoardJson = json;
  lastKnownEtag = etag;
}

export function noteServerBoardWritten(etag: string): void {
  lastKnownEtag = etag;
  suppressExternalPollUntil = Date.now() + EXTERNAL_POLL_SUPPRESS_MS;
}

export function shouldSuppressExternalServerPoll(): boolean {
  return Date.now() < suppressExternalPollUntil;
}

export function detachServerBoard(): void {
  lastSyncedBoardJson = null;
  lastKnownEtag = null;
  suppressExternalPollUntil = 0;
}

export function isServerBoardDirty(currentJson: string): boolean {
  if (lastSyncedBoardJson === null) return true;
  return !boardExportTextsEquivalent(currentJson, lastSyncedBoardJson);
}

export async function fetchAuthSession(): Promise<AuthSessionInfo> {
  const res = await fetch("/api/auth/session", { credentials: "include" });
  if (!res.ok) return { configured: false, authenticated: false };
  return (await res.json()) as AuthSessionInfo;
}

export async function loginServerBoard(username: string, password: string): Promise<void> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (res.status === 503) {
    throw new Error("Server-Board ist auf diesem Host nicht konfiguriert.");
  }
  if (res.status === 401) {
    throw new Error("Benutzername oder Passwort ist falsch.");
  }
  if (!res.ok) {
    throw new Error("Anmeldung fehlgeschlagen.");
  }
}

export async function logoutServerBoard(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  detachServerBoard();
}

function readBoardResponseMeta(res: Response): { etag: string; lastModified: number } {
  const etag = res.headers.get("etag") ?? '""';
  const lm = res.headers.get("last-modified");
  const lastModified = lm ? Date.parse(lm) : Date.now();
  return { etag, lastModified: Number.isFinite(lastModified) ? lastModified : Date.now() };
}

/** Nur ETag prüfen (kein JSON-Body) — für Polling. */
export async function fetchBoardEtagFromServer(): Promise<{ etag: string; lastModified: number } | null> {
  const res = await fetch("/api/board", {
    method: "HEAD",
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Board-Status fehlgeschlagen (${res.status}).`);
  return readBoardResponseMeta(res);
}

export async function fetchBoardFromServer(): Promise<BoardFetchResult | null> {
  const res = await fetch("/api/board", { credentials: "include", cache: "no-store" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Board laden fehlgeschlagen (${res.status}).`);
  const { etag, lastModified } = readBoardResponseMeta(res);
  const text = await res.text();
  return { text, etag, lastModified };
}

export async function writeBoardToServer(json: string, etag: string | null): Promise<string | null> {
  const headers: Record<string, string> = { "Content-Type": "application/json; charset=utf-8" };
  if (etag) headers["If-Match"] = etag;

  const res = await fetch("/api/board", {
    method: "PUT",
    credentials: "include",
    headers,
    body: json,
  });

  if (res.status === 401) return null;
  if (res.status === 412) {
    throw new Error("precondition_failed");
  }
  if (!res.ok) throw new Error(`Board speichern fehlgeschlagen (${res.status}).`);

  const newEtag = res.headers.get("etag");
  if (newEtag) {
    noteServerBoardWritten(newEtag);
    markServerBoardSynced(json, newEtag);
    return newEtag;
  }
  markServerBoardSynced(json, etag ?? '""');
  return etag;
}
