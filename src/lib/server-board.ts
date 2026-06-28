/**
 * Client-Helfer für LOX-Vault (verschlüsseltes Board auf dem Server).
 */

import { boardExportTextsEquivalent } from "@/lib/task-tree-json";
import { vaultApiUrl } from "@/lib/lox-vault-config";
import { decryptBoardBlob, encryptBoardJson, VaultDecryptError } from "@/lib/vault-crypto";
import { defaultLoxIdService } from "@/lib/lox-id";

export { VaultDecryptError };

export interface VaultStatusInfo {
  configured: boolean;
}

export interface BoardFetchResult {
  text: string;
  etag: string | null;
  lastModified: number;
}

export type VaultLinkIntent = "create" | "connect";

let linkedLoxId: string | null = null;
let lastSyncedBoardJson: string | null = null;
let lastKnownEtag: string | null = null;
let suppressExternalPollUntil = 0;
let pendingVaultLinkIntent: VaultLinkIntent = "connect";

export function setPendingVaultLinkIntent(intent: VaultLinkIntent): void {
  pendingVaultLinkIntent = intent;
}

export function consumePendingVaultLinkIntent(): VaultLinkIntent {
  const intent = pendingVaultLinkIntent;
  pendingVaultLinkIntent = "connect";
  return intent;
}

const EXTERNAL_POLL_SUPPRESS_MS = 6000;
const VAULT_AUTH_SCHEME = "Vault";

/** Nur echte ETags an den Server senden — nicht `""` oder null. */
export function isUsableVaultEtag(etag: string | null | undefined): etag is string {
  if (!etag) return false;
  const t = etag.trim();
  return t.length > 0 && t !== '""';
}

export function generateBoardLoxId(): string {
  return defaultLoxIdService.generateId("BRD");
}

function vaultAuthHeader(loxId: string): string {
  return `${VAULT_AUTH_SCHEME} ${loxId}`;
}

export function setLinkedVaultLoxId(loxId: string | null): void {
  linkedLoxId = loxId;
  if (!loxId) detachServerBoard();
}

export function getLinkedVaultLoxId(): string | null {
  return linkedLoxId;
}

export function isServerBoardLinked(): boolean {
  return Boolean(linkedLoxId) && (lastKnownEtag !== null || lastSyncedBoardJson !== null);
}

export function getLastSyncedBoardJson(): string | null {
  return lastSyncedBoardJson;
}

export function getLastKnownEtag(): string | null {
  return lastKnownEtag;
}

export function markServerBoardSynced(json: string, etag: string | null): void {
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

export async function fetchVaultStatus(): Promise<VaultStatusInfo> {
  try {
    const res = await fetch(vaultApiUrl("/api/vault/status"), { cache: "no-store" });
    if (res.status === 503) return { configured: false };
    if (!res.ok) return { configured: false };
    const data = (await res.json()) as VaultStatusInfo;
    return { configured: Boolean(data.configured) };
  } catch {
    return { configured: false };
  }
}

function readBoardResponseMeta(res: Response): { etag: string; lastModified: number } {
  const etag = res.headers.get("etag") ?? '""';
  const lm = res.headers.get("last-modified");
  const lastModified = lm ? Date.parse(lm) : Date.now();
  return { etag, lastModified: Number.isFinite(lastModified) ? lastModified : Date.now() };
}

export async function fetchBoardEtagFromServer(): Promise<{ etag: string; lastModified: number } | null> {
  if (!linkedLoxId) return null;
  const res = await fetch(vaultApiUrl("/api/vault"), {
    method: "HEAD",
    headers: { Authorization: vaultAuthHeader(linkedLoxId) },
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 404) return null;
  if (!res.ok) throw new Error(`Vault-Status fehlgeschlagen (${res.status}).`);
  return readBoardResponseMeta(res);
}

export async function fetchBoardFromServer(): Promise<BoardFetchResult | null> {
  if (!linkedLoxId) return null;
  const res = await fetch(vaultApiUrl("/api/vault"), {
    method: "GET",
    headers: { Authorization: vaultAuthHeader(linkedLoxId) },
    cache: "no-store",
  });
  if (res.status === 401) return null;
  if (res.status === 404) {
    return { text: "", etag: null, lastModified: 0 };
  }
  if (!res.ok) throw new Error(`Vault laden fehlgeschlagen (${res.status}).`);

  const { etag, lastModified } = readBoardResponseMeta(res);
  const blob = await res.arrayBuffer();
  try {
    const text = await decryptBoardBlob(linkedLoxId, blob);
    return { text, etag, lastModified };
  } catch (e) {
    if (e instanceof VaultDecryptError) throw e;
    throw new VaultDecryptError();
  }
}

export async function writeBoardToServer(json: string, etag: string | null): Promise<string> {
  if (!linkedLoxId) {
    throw new Error("Keine LOX-ID — Server-Verbindung fehlt.");
  }
  const encrypted = await encryptBoardJson(linkedLoxId, json);
  const headers: Record<string, string> = {
    Authorization: vaultAuthHeader(linkedLoxId),
    "Content-Type": "application/octet-stream",
  };
  if (isUsableVaultEtag(etag)) headers["If-Match"] = etag;

  const res = await fetch(vaultApiUrl("/api/vault"), {
    method: "PUT",
    headers,
    body: encrypted,
  });

  if (res.status === 401) {
    throw new Error("Zugriff verweigert — LOX-ID prüfen.");
  }
  if (res.status === 412) {
    throw new Error("precondition_failed");
  }
  if (res.status === 413) {
    throw new Error("Board ist zu groß für den Vault-Server.");
  }
  if (!res.ok) {
    throw new Error(`Vault speichern fehlgeschlagen (HTTP ${res.status}).`);
  }

  const newEtag = res.headers.get("etag");
  if (isUsableVaultEtag(newEtag)) {
    noteServerBoardWritten(newEtag);
    markServerBoardSynced(json, newEtag);
    return newEtag;
  }
  markServerBoardSynced(json, null);
  return "";
}
