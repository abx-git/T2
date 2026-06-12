/**
 * Offline-Pause und Wiederanbindung: Baseline beim Trennen, Abgleich beim Verbinden.
 */

import {
  boardExportTextsEquivalent,
  boardSnapshotToReplacePayload,
  buildBoardSnapshot,
  isBoardSnapshot,
  parseExportedDocument,
  stringifyExportedDocument,
} from "@/lib/task-tree-json";
import { useTaskTreeStore, type TaskTreeState } from "@/store/task-tree-store";

const STORAGE_KEY = "t2-server-board-offline-v1";

export interface OfflineBoardPauseState {
  version: 1;
  /** Letzter mit dem Server abgestimmter Stand (oder Stand beim Trennen). */
  baselineJson: string;
  baselineEtag: string | null;
  /** Board-Inhalt unmittelbar beim Trennen der Verknüpfung. */
  localAtPauseJson: string;
  /** Aktueller Offline-Entwurf (wird bei Änderungen aktualisiert). */
  draftJson: string;
  pausedAt: string;
  /** Netzausfall — bei „online“ wieder mit Server verbinden und abgleichen. */
  autoPaused?: boolean;
  /** Letzte bestätigte Op-Sequenz auf dem Server beim Trennen. */
  baselineSeq?: number;
}

export type ReconcilePlan =
  | { action: "in_sync" }
  | { action: "apply_remote" }
  | { action: "push_local" }
  | { action: "conflict" }
  | { action: "merge_ops"; appliedOps: number };

export function boardJsonFromTaskTreeState(s: Pick<
  TaskTreeState,
  | "roots"
  | "pathIds"
  | "collapsedIds"
  | "columnTitleOverrides"
  | "cardFieldVisibility"
  | "hideCompletedTasks"
  | "effortOnTasksEnabled"
  | "filterTags"
  | "completedTag"
>): string {
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

export function planServerBoardReconcile(
  localJson: string,
  remoteJson: string,
  baselineJson: string | null,
): ReconcilePlan {
  const baseline = baselineJson?.trim() ? baselineJson : localJson;
  const localEqBase = boardExportTextsEquivalent(localJson, baseline);
  const remoteEqBase = boardExportTextsEquivalent(remoteJson, baseline);
  const localEqRemote = boardExportTextsEquivalent(localJson, remoteJson);

  if (localEqRemote) return { action: "in_sync" };
  if (localEqBase && !remoteEqBase) return { action: "apply_remote" };
  if (!localEqBase && remoteEqBase) return { action: "push_local" };
  return { action: "conflict" };
}

export function isAutoPausedOffline(): boolean {
  return readOfflinePauseState()?.autoPaused === true;
}

export function hasOfflinePauseState(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

export function readOfflinePauseState(): OfflineBoardPauseState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OfflineBoardPauseState;
    if (parsed?.version !== 1 || typeof parsed.baselineJson !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeOfflinePauseState(state: OfflineBoardPauseState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* Speicher voll / privater Modus */
  }
}

export function clearOfflinePauseState(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Beim Trennen der Server-Verknüpfung: Offline-Baseline für späteren Abgleich. */
export function pauseServerBoardOffline(params: {
  baselineJson: string;
  baselineEtag: string | null;
  currentJson: string;
  autoPaused?: boolean;
  baselineSeq?: number;
}): void {
  const state: OfflineBoardPauseState = {
    version: 1,
    baselineJson: params.baselineJson,
    baselineEtag: params.baselineEtag,
    localAtPauseJson: params.currentJson,
    draftJson: params.currentJson,
    pausedAt: new Date().toISOString(),
    autoPaused: params.autoPaused ?? false,
    baselineSeq: params.baselineSeq,
  };
  writeOfflinePauseState(state);
}

export function updateOfflineDraftJson(draftJson: string): void {
  const prev = readOfflinePauseState();
  if (!prev) return;
  if (boardExportTextsEquivalent(prev.draftJson, draftJson)) return;
  writeOfflinePauseState({ ...prev, draftJson });
}

export function hasOfflinePendingChanges(currentJson: string): boolean {
  const pause = readOfflinePauseState();
  if (!pause) return false;
  return !boardExportTextsEquivalent(currentJson, pause.baselineJson);
}

export function applyBoardJsonToStore(json: string): boolean {
  if (!json.trim()) return true;
  try {
    const doc = parseExportedDocument(json);
    if (!isBoardSnapshot(doc)) return false;
    useTaskTreeStore.getState().replaceBoardFromImport(boardSnapshotToReplacePayload(doc));
    return true;
  } catch {
    return false;
  }
}
