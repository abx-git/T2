import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { getVaultDirPath, getVaultMaxBytes } from "@/lib/server/env";

export interface VaultBlobSnapshot {
  data: Buffer;
  etag: string;
  lastModified: number;
}

export function etagForVaultBlob(data: Buffer): string {
  const hash = createHash("sha256").update(data).digest("hex").slice(0, 16);
  return `"${hash}"`;
}

export function vaultFileNameForStorageKey(storageKey: string): string {
  const hash = createHash("sha256").update(storageKey, "utf8").digest("hex");
  return `${hash}.bin`;
}

async function ensureVaultDir(): Promise<string> {
  const dir = getVaultDirPath();
  await mkdir(dir, { recursive: true });
  return dir;
}

function filePathForKey(storageKey: string): string {
  return path.join(getVaultDirPath(), vaultFileNameForStorageKey(storageKey));
}

export async function readVaultBlob(storageKey: string): Promise<VaultBlobSnapshot | null> {
  const filePath = filePathForKey(storageKey);
  try {
    const data = await readFile(filePath);
    const st = await stat(filePath);
    return { data, etag: etagForVaultBlob(data), lastModified: st.mtimeMs };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

export async function writeVaultBlob(
  storageKey: string,
  data: Buffer,
  ifMatch: string | null,
): Promise<VaultBlobSnapshot> {
  const maxBytes = getVaultMaxBytes();
  if (data.byteLength > maxBytes) {
    const err = new Error("Payload Too Large") as Error & { status: number };
    err.status = 413;
    throw err;
  }

  await ensureVaultDir();
  const filePath = filePathForKey(storageKey);
  const current = await readVaultBlob(storageKey);
  if (ifMatch && current && ifMatch !== current.etag) {
    const err = new Error("Precondition Failed") as Error & { status: number };
    err.status = 412;
    throw err;
  }

  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, data);
  await rename(tmp, filePath);
  const st = await stat(filePath);
  return { data, etag: etagForVaultBlob(data), lastModified: st.mtimeMs };
}
