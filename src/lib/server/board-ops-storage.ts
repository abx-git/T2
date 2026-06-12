import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { applyBoardOpsFromClient } from "@/lib/board-ops/apply";
import { maxSeq } from "@/lib/board-ops/merge";
import type { BoardOpsFileV1, ClientBoardOp, StoredBoardOp } from "@/lib/board-ops/types";
import { BOARD_OPS_FORMAT_VERSION } from "@/lib/board-ops/types";
import { payloadToBoardJson } from "@/lib/board-ops/reconcile";
import { boardImportPayloadFromExportText } from "@/lib/task-tree-json";

import { getBoardOpsFilePath } from "./env";
import { readBoardFile, writeBoardFile } from "./board-storage";

function emptyOpsFile(): BoardOpsFileV1 {
  return { version: BOARD_OPS_FORMAT_VERSION, headSeq: 0, ops: [] };
}

async function ensureOpsDir(): Promise<void> {
  await mkdir(path.dirname(getBoardOpsFilePath()), { recursive: true });
}

export async function readBoardOpsFile(): Promise<BoardOpsFileV1> {
  const filePath = getBoardOpsFilePath();
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as BoardOpsFileV1;
    if (parsed?.version !== BOARD_OPS_FORMAT_VERSION || !Array.isArray(parsed.ops)) {
      return emptyOpsFile();
    }
    return {
      version: BOARD_OPS_FORMAT_VERSION,
      headSeq: typeof parsed.headSeq === "number" ? parsed.headSeq : maxSeq(parsed.ops),
      ops: parsed.ops,
    };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return emptyOpsFile();
    throw e;
  }
}

async function writeBoardOpsFile(file: BoardOpsFileV1): Promise<void> {
  await ensureOpsDir();
  const filePath = getBoardOpsFilePath();
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, JSON.stringify(file, null, 2), "utf8");
  await rename(tmp, filePath);
}

function boardPayloadFromSnapshotText(text: string) {
  return (
    boardImportPayloadFromExportText(text) ?? {
      roots: [],
      pathIds: [],
      columnTitleOverrides: {},
    }
  );
}

/** Materialisiert `t2-board.json` aus Snapshot-Basis + allen Ops. */
export async function materializeBoardSnapshotFromOps(): Promise<string> {
  const board = await readBoardFile();
  const opsFile = await readBoardOpsFile();
  const base = boardPayloadFromSnapshotText(board.text);
  const merged = applyBoardOpsFromClient(base, opsFile.ops);
  return payloadToBoardJson(merged);
}

export async function appendBoardOps(incoming: ClientBoardOp[]): Promise<{
  stored: StoredBoardOp[];
  headSeq: number;
}> {
  if (!incoming.length) {
    const f = await readBoardOpsFile();
    return { stored: [], headSeq: f.headSeq };
  }

  const file = await readBoardOpsFile();
  const knownIds = new Set(file.ops.map((o) => o.opId));
  const stored: StoredBoardOp[] = [];
  let seq = file.headSeq;

  for (const op of incoming) {
    if (knownIds.has(op.opId)) continue;
    seq += 1;
    const row: StoredBoardOp = { ...op, seq };
    file.ops.push(row);
    knownIds.add(op.opId);
    stored.push(row);
  }

  file.headSeq = seq;
  await writeBoardOpsFile(file);

  if (stored.length) {
    const json = await materializeBoardSnapshotFromOps();
    await writeBoardFile(json, null);
  }

  return { stored, headSeq: file.headSeq };
}

export function listOpsAfter(file: BoardOpsFileV1, afterSeq: number): StoredBoardOp[] {
  return file.ops.filter((o) => o.seq > afterSeq);
}
