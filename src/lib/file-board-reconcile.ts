/**
 * Abgleich zwischen lokalem Board-Stand und Arbeitsdatei.
 */

import {
  boardExportTextsEquivalent,
  boardImportPayloadFromExportText,
  boardSnapshotToReplacePayload,
  buildBoardSnapshot,
  isBoardSnapshot,
  parseExportedDocument,
  stableBoardStateKey,
  stringifyExportedDocument,
  type BoardSnapshotV1,
} from "@/lib/task-tree-json";
import { useTaskTreeStore } from "@/store/task-tree-store";

export type FileConflictChoice = "load_file" | "keep_local";

export type FileReconcilePlan =
  | { action: "in_sync" }
  | { action: "apply_file" }
  | { action: "push_local" }
  | { action: "conflict" };

export interface BoardImportPayload {
  roots: import("@/types/task-node").TaskNode[];
  pathIds: string[];
  collapsedIds?: string[];
  columnTitleOverrides: Record<number, string>;
  cardFieldVisibility?: import("@/lib/card-field-visibility").CardFieldVisibility;
  hideCompletedTasks?: boolean;
  filterTags?: string[];
  completedTag?: string;
  effortOnTasksEnabled?: boolean;
}

function payloadFromExportText(text: string): BoardImportPayload | null {
  return boardImportPayloadFromExportText(text);
}

function isEmptyPayload(payload: BoardImportPayload | null): boolean {
  return !payload || payload.roots.length === 0;
}

export function planFileReconcile(localJson: string, fileJson: string): FileReconcilePlan {
  if (boardExportTextsEquivalent(localJson, fileJson)) {
    return { action: "in_sync" };
  }

  const localPayload = payloadFromExportText(localJson);
  const filePayload = payloadFromExportText(fileJson);

  if (isEmptyPayload(localPayload) && filePayload && filePayload.roots.length > 0) {
    return { action: "apply_file" };
  }

  if (isEmptyPayload(filePayload) && localPayload && localPayload.roots.length > 0) {
    return { action: "push_local" };
  }

  if (!fileJson.trim() && localJson.trim()) {
    return { action: "push_local" };
  }

  if (fileJson.trim() && !localJson.trim()) {
    return { action: "apply_file" };
  }

  return { action: "conflict" };
}

export function applyBoardPayloadToStore(payload: BoardImportPayload): void {
  useTaskTreeStore.getState().replaceBoardFromImport(payload);
}

export function applyBoardJsonToStore(json: string): boolean {
  const payload = payloadFromExportText(json);
  if (!payload) return false;
  applyBoardPayloadToStore(payload);
  return true;
}

export function boardJsonFromStoreState(): string {
  const s = useTaskTreeStore.getState();
  return stringifyExportedDocument(
    buildBoardSnapshot(
      s.roots,
      s.pathIds,
      s.columnTitleOverrides,
      s.cardFieldVisibility,
      s.hideCompletedTasks,
      s.effortOnTasksEnabled,
      s.filterTags,
      s.completedTag,
      s.collapsedIds,
    ),
  );
}

export function parseBoardSnapshotFromText(text: string): BoardSnapshotV1 | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const doc = parseExportedDocument(trimmed);
    return isBoardSnapshot(doc) ? doc : null;
  } catch {
    return null;
  }
}

export function boardPayloadFromSnapshot(snap: BoardSnapshotV1): BoardImportPayload {
  return boardSnapshotToReplacePayload(snap);
}

export function boardStatesEquivalent(a: string, b: string): boolean {
  return boardExportTextsEquivalent(a, b);
}

export function stableKeyFromJson(text: string): string | null {
  const payload = payloadFromExportText(text);
  if (!payload) return null;
  return stableBoardStateKey(payload);
}

/** Stabiler Schlüssel des persistierten Board-Stands (ohne UI-only State wie focusNodeId). */
export function boardPersistKeyFromStoreState(): string {
  const s = useTaskTreeStore.getState();
  return stableBoardStateKey({
    roots: s.roots,
    pathIds: s.pathIds,
    collapsedIds: s.collapsedIds,
    columnTitleOverrides: s.columnTitleOverrides,
    cardFieldVisibility: s.cardFieldVisibility,
    hideCompletedTasks: s.hideCompletedTasks,
    effortOnTasksEnabled: s.effortOnTasksEnabled,
    filterTags: s.filterTags,
    completedTag: s.completedTag,
  });
}
