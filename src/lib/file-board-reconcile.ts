/**
 * Abgleich zwischen lokalem Board-Stand und Arbeitsdatei — inkl. Zusammenführen.
 */

import { generateUniqueTaskIdFromTaken } from "@/lib/task-id";
import {
  boardExportTextsEquivalent,
  boardImportPayloadFromExportText,
  boardSnapshotToReplacePayload,
  buildBoardSnapshot,
  isBoardSnapshot,
  parseExportedDocument,
  remapTaskNodeIds,
  stableBoardStateKey,
  stringifyExportedDocument,
  type BoardSnapshotV1,
} from "@/lib/task-tree-json";
import type { TaskNode } from "@/types/task-node";
import { useTaskTreeStore } from "@/store/task-tree-store";

export type FileConflictResolution = "load_file" | "keep_local" | "merge" | "cancel";

export type FileReconcilePlan =
  | { action: "in_sync" }
  | { action: "apply_file" }
  | { action: "push_local" }
  | { action: "conflict" };

export interface BoardImportPayload {
  roots: TaskNode[];
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

function mergeStampLabel(): string {
  return new Date().toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Alle Wurzeln beider Stände unter einem neuen Merge-Knoten zusammenführen (IDs neu vergeben). */
export function mergeBoardPayloads(
  local: BoardImportPayload,
  file: BoardImportPayload,
): BoardImportPayload {
  const taken = new Set<string>();
  const remappedRoots: TaskNode[] = [];

  for (const root of local.roots) {
    const remapped = remapTaskNodeIds(root);
    const walk = (n: TaskNode) => {
      taken.add(n.id);
      n.children.forEach(walk);
    };
    walk(remapped);
    remappedRoots.push(remapped);
  }

  for (const root of file.roots) {
    const remapped = remapTaskNodeIdsWithTaken(root, taken);
    remappedRoots.push(remapped);
  }

  const mergeRootId = generateUniqueTaskIdFromTaken(taken);
  const mergeRoot: TaskNode = {
    id: mergeRootId,
    title: `Zusammengeführt ${mergeStampLabel()}`,
    link: "",
    description: "Automatisch zusammengeführte Daten aus lokalem Stand und Arbeitsdatei.",
    tags: [],
    dueDate: null,
    reminderDate: null,
    effort: 0,
    children: remappedRoots,
  };

  return {
    roots: [mergeRoot],
    pathIds: [mergeRootId],
    collapsedIds: [],
    columnTitleOverrides: { ...file.columnTitleOverrides, ...local.columnTitleOverrides },
    cardFieldVisibility: local.cardFieldVisibility ?? file.cardFieldVisibility,
    hideCompletedTasks: local.hideCompletedTasks ?? file.hideCompletedTasks,
    filterTags: local.filterTags?.length ? local.filterTags : file.filterTags,
    completedTag: local.completedTag ?? file.completedTag,
    effortOnTasksEnabled: local.effortOnTasksEnabled ?? file.effortOnTasksEnabled,
  };
}

function remapTaskNodeIdsWithTaken(root: TaskNode, taken: Set<string>): TaskNode {
  function walk(n: TaskNode): TaskNode {
    const id = generateUniqueTaskIdFromTaken(taken);
    taken.add(id);
    return {
      ...n,
      id,
      dueDate: n.dueDate ? new Date(n.dueDate.getTime()) : null,
      reminderDate: n.reminderDate ? new Date(n.reminderDate.getTime()) : null,
      children: n.children.map(walk),
    };
  }
  return walk(root);
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

export function mergeBoardJsonTexts(localJson: string, fileJson: string): string | null {
  const local = payloadFromExportText(localJson);
  const file = payloadFromExportText(fileJson);
  if (!local || !file) return null;
  const merged = mergeBoardPayloads(local, file);
  return stringifyExportedDocument(
    buildBoardSnapshot(
      merged.roots,
      merged.pathIds,
      merged.columnTitleOverrides,
      merged.cardFieldVisibility ?? useTaskTreeStore.getState().cardFieldVisibility,
      merged.hideCompletedTasks ?? false,
      merged.effortOnTasksEnabled !== false,
      merged.filterTags ?? [],
      merged.completedTag,
      merged.collapsedIds ?? [],
    ),
  );
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
