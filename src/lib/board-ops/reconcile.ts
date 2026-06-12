import { applyBoardOpsFromClient } from "@/lib/board-ops/apply";
import { mergeOpsChronologically } from "@/lib/board-ops/merge";
import type { ClientBoardOp, StoredBoardOp } from "@/lib/board-ops/types";
import { mergeCardFieldVisibility } from "@/lib/card-field-visibility";
import {
  boardImportPayloadFromExportText,
  boardSnapshotToReplacePayload,
  buildBoardSnapshot,
  isBoardSnapshot,
  parseExportedDocument,
  stringifyExportedDocument,
} from "@/lib/task-tree-json";
import type { BoardImportPayload } from "@/lib/task-tree-json";

export function boardPayloadFromExportJson(json: string): BoardImportPayload {
  const trimmed = json.trim();
  if (!trimmed) {
    return { roots: [], pathIds: [], columnTitleOverrides: {} };
  }
  const fromImport = boardImportPayloadFromExportText(trimmed);
  if (fromImport) return fromImport;
  try {
    const doc = parseExportedDocument(trimmed);
    if (isBoardSnapshot(doc)) return boardSnapshotToReplacePayload(doc);
  } catch {
    /* ignore */
  }
  return { roots: [], pathIds: [], columnTitleOverrides: {} };
}

export function payloadToBoardJson(payload: BoardImportPayload): string {
  return stringifyExportedDocument(
    buildBoardSnapshot(
      payload.roots,
      payload.pathIds,
      payload.columnTitleOverrides,
      mergeCardFieldVisibility(payload.cardFieldVisibility),
      payload.hideCompletedTasks === true,
      payload.effortOnTasksEnabled !== false,
      payload.filterTags,
      payload.completedTag,
      payload.collapsedIds ?? [],
    ),
  );
}

/** Chronologische Zusammenführung aller Ops seit der Baseline. */
export function mergeBoardStateFromOps(
  baselineJson: string,
  remoteOps: StoredBoardOp[],
  localPending: ClientBoardOp[],
): BoardImportPayload {
  const base = boardPayloadFromExportJson(baselineJson);
  const merged = mergeOpsChronologically(remoteOps, localPending);
  return applyBoardOpsFromClient(base, merged);
}
