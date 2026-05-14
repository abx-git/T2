import { create } from "zustand";

import {
  applyMindmapDrop,
  columnIndexOfNode,
  detachNodeById,
  findNodeById,
  getSiblingsList,
  insertUnderParent,
  normalizePathIds,
  pathFromRootToNode,
  updateNodeFields,
  type TreeDragOverKind,
} from "@/lib/tree-utils";
import { DEFAULT_CARD_FIELD_VISIBILITY, mergeCardFieldVisibility, type CardFieldVisibility } from "@/lib/card-field-visibility";
import { compactColumnTitleOverrides } from "@/lib/column-titles";
import { remapTaskNodeIds } from "@/lib/task-tree-json";
import type { TaskCardEditableFields, TaskNode } from "@/types/task-node";

export interface TaskTreeState {
  roots: TaskNode[];
  /** Kette expandierter Knoten-IDs: Spalte k>0 zeigt Kinder von pathIds[k-1]. */
  pathIds: string[];

  /** Erledigte Karten in Spaltenansicht ausblenden (nur Anzeige). */
  hideCompletedTasks: boolean;
  setHideCompletedTasks: (hide: boolean) => void;

  /** Sichtbare Kartenfelder (außer Titel) in Karten- und Detailansicht. */
  cardFieldVisibility: CardFieldVisibility;
  applyCardFieldVisibility: (next: CardFieldVisibility) => void;

  /** Wenn aus: keine Stunden-Eingabe und keine Aufwands-Anzeige (inkl. Σ). */
  effortOnTasksEnabled: boolean;
  setEffortOnTasksEnabled: (on: boolean) => void;

  /** Anzeige-Namen der Spalten (Index → Titel); leer / gleich Standard → nicht gesetzt. */
  columnTitleOverrides: Record<number, string>;
  /** Setzt die sichtbaren Spalten-Titel aus einem Dialog-Entwurf (Länge = Anzahl Spalten). */
  applyColumnTitleDraft: (draft: string[]) => void;

  /** Drill-Pfad von der Wurzel bis zu `nodeId` setzen (Spaltenansicht). */
  expandToNode: (nodeId: string) => void;
  /**
   * Mindmap-DnD: siehe `applyMindmapDrop` in tree-utils.
   */
  applyTreeDrag: (activeId: string, overKind: TreeDragOverKind) => void;

  /** Neue Karte am Ende der Geschwisterliste unter `parentId` (`null` = Wurzel). Liefert die neue ID. */
  addCardAfter: (parentId: string | null) => string;
  updateCard: (nodeId: string, fields: TaskCardEditableFields) => void;
  /** Entfernt die Karte inkl. gesamtem Unterbaum. */
  removeCard: (nodeId: string) => void;

  /** Gesamten Board-Zustand aus Import ersetzen (Karten, Pfad, Ebenen-Namen, Einstellungen). */
  replaceBoardFromImport: (payload: {
    roots: TaskNode[];
    pathIds: string[];
    columnTitleOverrides: Record<number, string>;
    hideCompletedTasks?: boolean;
    cardFieldVisibility?: CardFieldVisibility;
    effortOnTasksEnabled?: boolean;
  }) => void;
  /**
   * Teilbaum unter `parentId` einfügen (`null` = neue Wurzel am Ende).
   * IDs im `root` werden neu vergeben, um Kollisionen zu vermeiden.
   */
  importSubtreeRoot: (parentId: string | null, root: TaskNode) => void;
}

/** Hilfe für DnD: ermittelt Spaltenindex anhand einer Knoten-ID. */
export function resolveColumnIndexForDrag(
  roots: TaskNode[],
  pathIds: string[],
  nodeId: string,
): number | null {
  return columnIndexOfNode(roots, pathIds, nodeId);
}

export const useTaskTreeStore = create<TaskTreeState>((set, get) => ({
  roots: [],
  pathIds: [],

  hideCompletedTasks: false,

  setHideCompletedTasks: (hide) => set({ hideCompletedTasks: hide }),

  cardFieldVisibility: { ...DEFAULT_CARD_FIELD_VISIBILITY },

  applyCardFieldVisibility: (next) =>
    set({ cardFieldVisibility: mergeCardFieldVisibility(next) }),

  effortOnTasksEnabled: true,

  setEffortOnTasksEnabled: (on) => set({ effortOnTasksEnabled: on }),

  columnTitleOverrides: {},

  applyColumnTitleDraft: (draft) =>
    set({ columnTitleOverrides: compactColumnTitleOverrides(draft) }),

  expandToNode: (nodeId) => {
    set((s) => {
      const next = pathFromRootToNode(s.roots, nodeId);
      if (!next) return {};
      return { pathIds: next };
    });
  },

  applyTreeDrag: (activeId, overKind) => {
    const { roots, pathIds } = get();
    const nextRoots = applyMindmapDrop(roots, pathIds, activeId, overKind);
    const nextPath = normalizePathIds(nextRoots, pathIds);
    set({ roots: nextRoots, pathIds: nextPath });
  },

  addCardAfter: (parentId) => {
    const id = crypto.randomUUID();
    const newNode: TaskNode = {
      id,
      title: "",
      description: "",
      tags: [],
      dueDate: null,
      reminderDate: null,
      effort: 0,
      children: [],
    };
    set((s) => {
      const sibs = getSiblingsList(s.roots, parentId);
      const nextRoots = insertUnderParent(s.roots, parentId, sibs.length, newNode);
      return { roots: nextRoots, pathIds: normalizePathIds(nextRoots, s.pathIds) };
    });
    return id;
  },

  updateCard: (nodeId, fields) => {
    set((s) => {
      const nextRoots = updateNodeFields(s.roots, nodeId, fields);
      return { roots: nextRoots, pathIds: normalizePathIds(nextRoots, s.pathIds) };
    });
  },

  removeCard: (nodeId) => {
    set((s) => {
      const { next, detached } = detachNodeById(s.roots, nodeId);
      if (!detached) return {};
      return { roots: next, pathIds: normalizePathIds(next, s.pathIds) };
    });
  },

  replaceBoardFromImport: (payload) => {
    const {
      roots,
      pathIds: incomingPath,
      columnTitleOverrides,
      hideCompletedTasks: incomingHideDone,
      cardFieldVisibility: incomingVisibility,
      effortOnTasksEnabled: incomingEffort,
    } = payload;
    const pathIds = normalizePathIds(roots, incomingPath);
    set({
      roots,
      pathIds,
      columnTitleOverrides,
      ...(typeof incomingHideDone === "boolean" ? { hideCompletedTasks: incomingHideDone } : {}),
      cardFieldVisibility: mergeCardFieldVisibility(incomingVisibility),
      ...(typeof incomingEffort === "boolean" ? { effortOnTasksEnabled: incomingEffort } : {}),
    });
  },

  importSubtreeRoot: (parentId, root) => {
    set((s) => {
      if (parentId !== null && !findNodeById(s.roots, parentId)) return {};
      const fresh = remapTaskNodeIds(root);
      if (parentId === null) {
        const nextRoots = [...s.roots, fresh];
        return { roots: nextRoots, pathIds: normalizePathIds(nextRoots, s.pathIds) };
      }
      const sibs = getSiblingsList(s.roots, parentId);
      const nextRoots = insertUnderParent(s.roots, parentId, sibs.length, fresh);
      return { roots: nextRoots, pathIds: normalizePathIds(nextRoots, s.pathIds) };
    });
  },
}));

export function isOnActivePath(pathIds: string[], nodeId: string): boolean {
  return pathIds.includes(nodeId);
}

export function isDrilledFromColumn(pathIds: string[], columnIndex: number, nodeId: string): boolean {
  return pathIds[columnIndex] === nodeId;
}

export function getNodeOrNull(roots: TaskNode[], id: string): TaskNode | null {
  return findNodeById(roots, id);
}
