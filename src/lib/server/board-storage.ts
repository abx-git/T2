import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { getBoardFilePath } from "@/lib/server/env";

export interface BoardFileSnapshot {
  text: string;
  etag: string;
  lastModified: number;
}

export function etagForContent(text: string): string {
  const hash = createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
  return `"${hash}"`;
}

async function ensureBoardDir(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

export async function readBoardFile(): Promise<BoardFileSnapshot> {
  const filePath = getBoardFilePath();
  try {
    const text = await readFile(filePath, "utf8");
    const st = await stat(filePath);
    return { text, etag: etagForContent(text), lastModified: st.mtimeMs };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return { text: "", etag: etagForContent(""), lastModified: 0 };
    }
    throw e;
  }
}

export async function writeBoardFile(text: string, ifMatch: string | null): Promise<BoardFileSnapshot> {
  const filePath = getBoardFilePath();
  await ensureBoardDir(filePath);

  const current = await readBoardFile();
  if (ifMatch && ifMatch !== current.etag) {
    const err = new Error("Precondition Failed") as Error & { status: number };
    err.status = 412;
    throw err;
  }

  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, text, "utf8");
  await rename(tmp, filePath);
  const st = await stat(filePath);
  return { text, etag: etagForContent(text), lastModified: st.mtimeMs };
}
