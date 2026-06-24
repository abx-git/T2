import { create } from "zustand";

import {
  applyMindmapDrop,
  columnIndexOfNode,
  collectSubtreeNodeIds,
  detachNodeById,
  findDirectParentId,
  findNodeById,
  getSiblingsList,
  insertUnderParent,
  normalizePathIds,
  pathFromRootToNode,
  pathIdsAfterNodeMove,
  updateNodeFields,
  type TreeDragOverKind,
} from "@/lib/tree-utils";
import { DEFAULT_CARD_FIELD_VISIBILITY, mergeCardFieldVisibility, type CardFieldVisibility } from "@/lib/card-field-visibility";
import { compactColumnTitleOverrides } from "@/lib/column-titles";
import { refreshCalculatedEffortsInTree } from "@/lib/task-effort";
import { generateUniqueTaskId } from "@/lib/task-id";
import { remapTaskNodeIds } from "@/lib/task-tree-json";
import { pruneEmptyUxLeavesInFocusSubtree } from "@/lib/focus-mode-outline";
import { DEFAULT_COMPLETED_TAG, normalizeCompletedTag, normalizeTagLabel, tagKey } from "@/lib/task-tags";
import type { TaskCardEditableFields, TaskNode } from "@/types/task-node";

export interface TaskTreeState {
  roots: TaskNode[];
  /** Persistierter Pfad (DnD/Import); keine UI-Hervorhebung mehr. */
  pathIds: string[];
  /** Eingeklappte Knoten-IDs (Kinder ausgeblendet). */
  collapsedIds: string[];
  toggleNodeCollapsed: (nodeId: string) => void;

  /** Erledigte Karten in Spaltenansicht ausblenden (nur Anzeige). */
  hideCompletedTasks: boolean;
  setHideCompletedTasks: (hide: boolean) => void;

  /** Tag-Name, der eine Karte als erledigt markiert (Groß-/Kleinschreibung egal). */
  completedTag: string;
  setCompletedTag: (tag: string) => void;

  /** Tag-Filter (OR): Karte sichtbar, wenn Tag gesetzt oder Nachfahre passt. */
  filterTags: string[];
  setFilterTags: (tags: string[]) => void;
  addFilterTag: (tag: string) => void;
  removeFilterTag: (tag: string) => void;

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

  /**
   * Karte mit Kindern: nur diesen Ast zu-/aufklappen (direkte Ebene); tiefere `collapsedIds` bleiben.
   */
  activateNode: (nodeId: string) => void;
  /** Pfad bis `nodeId` sichtbar machen (alle Vorfahren aufklappen) — z. B. Suche. */
  expandToNode: (nodeId: string) => void;

  /** Fokus-Modus: welche Karte (Teilbaum) im Vordergrund bearbeitet wird; `null` = Mindmap. */
  focusNodeId: string | null;
  /** Öffnet den Fokus-Modus für `nodeId` und klappt den Pfad dorthin auf. */
  openFocusMode: (nodeId: string) => void;
  closeFocusMode: () => void;

  /**
   * Mindmap-DnD: siehe `applyMindmapDrop` in tree-utils.
   */
  applyTreeDrag: (activeId: string, overKind: TreeDragOverKind) => void;

  /** Neue Karte am Ende der Geschwisterliste unter `parentId` (`null` = Wurzel). Liefert die neue ID. */
  addCardAfter: (parentId: string | null) => string;
  /** Neue Geschwisterkarte direkt unter `afterNodeId`. */
  addCardAfterSibling: (afterNodeId: string) => string | null;
  updateCard: (nodeId: string, fields: Partial<TaskCardEditableFields>) => void;
  /** Entfernt die Karte inkl. gesamtem Unterbaum. */
  removeCard: (nodeId: string) => void;

  /** Gesamten Board-Zustand aus Import ersetzen (Karten, Pfad, Ebenen-Namen, Einstellungen). */
  replaceBoardFromImport: (payload: {
    roots: TaskNode[];
    pathIds: string[];
    collapsedIds?: string[];
    columnTitleOverrides: Record<number, string>;
    hideCompletedTasks?: boolean;
    completedTag?: string;
    filterTags?: string[];
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

function insertCardAtIndex(
  set: (fn: (s: TaskTreeState) => Partial<TaskTreeState>) => void,
  get: () => TaskTreeState,
  parentId: string | null,
  index: number,
): string {
  const id = generateUniqueTaskId(get().roots);
  const newNode: TaskNode = {
    id,
    title: "",
    link: "",
    description: "",
    tags: [],
    dueDate: null,
    reminderDate: null,
    effort: 0,
    effortUnit: "hours",
    effortSource: "manual",
    children: [],
  };
  set((s) => {
    const nextRoots = refreshCalculatedEffortsInTree(
      insertUnderParent(s.roots, parentId, index, newNode),
      s.completedTag,
    );
    return { roots: nextRoots, pathIds: normalizePathIds(nextRoots, s.pathIds) };
  });
  return id;
}

export const useTaskTreeStore = create<TaskTreeState>((set, get) => ({
  roots: [],
  pathIds: [],
  collapsedIds: [],

  focusNodeId: null,

  hideCompletedTasks: false,

  setHideCompletedTasks: (hide) => {
    set({ hideCompletedTasks: hide });
  },

  completedTag: DEFAULT_COMPLETED_TAG,

  setCompletedTag: (tag) => {
    const completedTag = normalizeCompletedTag(tag);
    set({ completedTag });
  },

  filterTags: [],

  setFilterTags: (tags) => {
    const filterTags = tags
      .map((t) => normalizeTagLabel(t))
      .filter(Boolean)
      .filter((t, i, arr) => arr.findIndex((x) => tagKey(x) === tagKey(t)) === i);
    set({ filterTags });
  },

  addFilterTag: (tag) => {
    const label = normalizeTagLabel(tag);
    if (!label) return;
    set((s) => {
      if (s.filterTags.some((t) => tagKey(t) === tagKey(label))) return {};
      const filterTags = [...s.filterTags, label];
      return { filterTags };
    });
  },

  removeFilterTag: (tag) => {
    const k = tagKey(tag);
    set((s) => {
      const filterTags = s.filterTags.filter((t) => tagKey(t) !== k);
      return { filterTags };
    });
  },

  cardFieldVisibility: { ...DEFAULT_CARD_FIELD_VISIBILITY },

  applyCardFieldVisibility: (next) => {
    const cardFieldVisibility = mergeCardFieldVisibility(next);
    set({ cardFieldVisibility });
  },

  effortOnTasksEnabled: true,

  setEffortOnTasksEnabled: (on) => {
    set({ effortOnTasksEnabled: on });
  },

  columnTitleOverrides: {},

  applyColumnTitleDraft: (draft) => {
    const columnTitleOverrides = compactColumnTitleOverrides(draft);
    set({ columnTitleOverrides });
    const co: Record<string, string> = {};
    for (const [k, v] of Object.entries(columnTitleOverrides)) {
      co[String(k)] = v;
    }
  },

  toggleNodeCollapsed: (nodeId) => {
    set((s) => {
      const has = s.collapsedIds.includes(nodeId);
      const collapsedIds = has
        ? s.collapsedIds.filter((id) => id !== nodeId)
        : [...s.collapsedIds, nodeId];
      return { collapsedIds };
    });
  },

  activateNode: (nodeId) => {
    set((s) => {
      const node = findNodeById(s.roots, nodeId);
      if (!node || node.children.length === 0) return {};
      const isCollapsed = s.collapsedIds.includes(nodeId);
      const collapsedIds = isCollapsed
        ? s.collapsedIds.filter((id) => id !== nodeId)
        : [...s.collapsedIds, nodeId];
      return { collapsedIds };
    });
  },

  expandToNode: (nodeId) => {
    set((s) => {
      const path = pathFromRootToNode(s.roots, nodeId);
      if (!path) return {};
      const open = new Set(path);
      const collapsedIds = s.collapsedIds.filter((id) => !open.has(id));
      if (collapsedIds.length === s.collapsedIds.length) return {};
      return { collapsedIds };
    });
  },

  openFocusMode: (nodeId) => {
    set((s) => {
      if (!findNodeById(s.roots, nodeId)) return {};
      const path = pathFromRootToNode(s.roots, nodeId);
      if (!path) return {};
      const open = new Set(path);
      const collapsedIds = s.collapsedIds.filter((id) => !open.has(id));
      if (collapsedIds.length !== s.collapsedIds.length) {
      }
      return { focusNodeId: nodeId, collapsedIds };
    });
  },

  closeFocusMode: () => {
    set((s) => {
      if (!s.focusNodeId) return { focusNodeId: null };
      const { roots: prunedRoots, removedIds } = pruneEmptyUxLeavesInFocusSubtree(
        s.roots,
        s.focusNodeId,
      );
      for (const nodeId of removedIds) {
      }
      if (removedIds.length === 0) return { focusNodeId: null };
      const nextRoots = refreshCalculatedEffortsInTree(prunedRoots, s.completedTag);
      const removedSet = new Set(removedIds);
      const collapsedIds = s.collapsedIds.filter((id) => !removedSet.has(id));
      const pathIds = normalizePathIds(nextRoots, s.pathIds);
      return { focusNodeId: null, roots: nextRoots, pathIds, collapsedIds };
    });
  },

  applyTreeDrag: (activeId, overKind) => {
    const { roots, pathIds } = get();
    const { completedTag } = get();
    const nextRoots = refreshCalculatedEffortsInTree(
      applyMindmapDrop(roots, pathIds, activeId, overKind),
      completedTag,
    );
    const nextPath = pathIdsAfterNodeMove(nextRoots, activeId, pathIds);
    set({ roots: nextRoots, pathIds: nextPath });
  },

  addCardAfter: (parentId) => {
    const index = getSiblingsList(get().roots, parentId).length;
    return insertCardAtIndex(set, get, parentId, index);
  },

  addCardAfterSibling: (afterNodeId) => {
    const roots = get().roots;
    const parentId = findDirectParentId(roots, afterNodeId);
    if (parentId === undefined) return null;
    const sibs = getSiblingsList(roots, parentId);
    const idx = sibs.findIndex((n) => n.id === afterNodeId);
    const index = idx >= 0 ? idx + 1 : sibs.length;
    return insertCardAtIndex(set, get, parentId, index);
  },

  updateCard: (nodeId, fields) => {
    set((s) => {
      const nextRoots = refreshCalculatedEffortsInTree(
        updateNodeFields(s.roots, nodeId, fields),
        s.completedTag,
      );
      return { roots: nextRoots, pathIds: normalizePathIds(nextRoots, s.pathIds) };
    });
  },

  removeCard: (nodeId) => {
    set((s) => {
      const { next, detached } = detachNodeById(s.roots, nodeId);
      if (!detached) return {};
      const removedIds = collectSubtreeNodeIds(detached);
      const nextRoots = refreshCalculatedEffortsInTree(next, s.completedTag);
      const collapsedIds = s.collapsedIds.filter((id) => !removedIds.has(id));
      const nextFocus =
        s.focusNodeId && findNodeById(nextRoots, s.focusNodeId) ? s.focusNodeId : null;
      return {
        roots: nextRoots,
        pathIds: normalizePathIds(nextRoots, s.pathIds),
        collapsedIds,
        focusNodeId: nextFocus,
      };
    });
  },

  replaceBoardFromImport: (payload) => {
    const {
      roots,
      pathIds: incomingPath,
      columnTitleOverrides,
      hideCompletedTasks: incomingHideDone,
      completedTag: incomingCompletedTag,
      filterTags: incomingFilterTags,
      cardFieldVisibility: incomingVisibility,
      effortOnTasksEnabled: incomingEffort,
    } = payload;
    const pathIds = normalizePathIds(roots, incomingPath);
    const collapsedIds = Array.isArray(payload.collapsedIds)
      ? payload.collapsedIds.filter((x): x is string => typeof x === "string")
      : [];
    set({
      roots,
      pathIds,
      collapsedIds,
      focusNodeId: null,
      columnTitleOverrides,
      ...(typeof incomingHideDone === "boolean" ? { hideCompletedTasks: incomingHideDone } : {}),
      ...(typeof incomingCompletedTag === "string"
        ? { completedTag: normalizeCompletedTag(incomingCompletedTag) }
        : {}),
      ...(incomingFilterTags !== undefined
        ? {
            filterTags: incomingFilterTags
              .map((t) => normalizeTagLabel(t))
              .filter(Boolean)
              .filter((t, i, arr) => arr.findIndex((x) => tagKey(x) === tagKey(t)) === i),
          }
        : {}),
      cardFieldVisibility: mergeCardFieldVisibility(incomingVisibility),
      ...(typeof incomingEffort === "boolean" ? { effortOnTasksEnabled: incomingEffort } : {}),
    });
  },

  importSubtreeRoot: (parentId, root) => {
    const fresh = remapTaskNodeIds(root);
    let applied = false;
    set((s) => {
      if (parentId !== null && !findNodeById(s.roots, parentId)) return {};
      applied = true;
      if (parentId === null) {
        const nextRoots = [...s.roots, fresh];
        return { roots: nextRoots, pathIds: normalizePathIds(nextRoots, s.pathIds) };
      }
      const sibs = getSiblingsList(s.roots, parentId);
      const nextRoots = refreshCalculatedEffortsInTree(
        insertUnderParent(s.roots, parentId, sibs.length, fresh),
        s.completedTag,
      );
      return { roots: nextRoots, pathIds: normalizePathIds(nextRoots, s.pathIds) };
    });
    if (applied) {
    }
  },
}));

export function getNodeOrNull(roots: TaskNode[], id: string): TaskNode | null {
  return findNodeById(roots, id);
}
