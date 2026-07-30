import { create } from "zustand";

import {
  contextIdForRevealingNode,
  normalizeContextNodeId,
} from "@/lib/board-context";
import {
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
} from "@/lib/tree-utils";
import { DEFAULT_CARD_FIELD_VISIBILITY, mergeCardFieldVisibility, type CardFieldVisibility } from "@/lib/card-field-visibility";
import { compactColumnTitleOverrides } from "@/lib/column-titles";
import {
  applyForestDrop,
  findNodeForestLocation,
  insertIntoForest,
  type ForestDropTarget,
  type UnifiedDragDrop,
} from "@/lib/clipboard-dnd";
import {
  applyContextListDrop,
  insertNodeIntoContextList,
  type ContextListDrop,
} from "@/lib/context-list-dnd";
import { refreshCalculatedEffortsInTree } from "@/lib/task-effort";
import { collectAllNodeIds, generateUniqueTaskId, generateUniqueTaskIdFromTaken } from "@/lib/task-id";
import { remapTaskNodeIds } from "@/lib/task-tree-json";
import {
  collapsedIdsAfterBoardDepthAction,
  defaultBoardCollapsedIds,
} from "@/lib/tree-depth-collapse";
import {
  DEFAULT_COMPLETED_TAG,
  defaultTagsForNewCard,
  normalizeCompletedTag,
  normalizeTagLabel,
  renameTagInForest,
  tagKey,
} from "@/lib/task-tags";
import type { TaskCardEditableFields, TaskNode } from "@/types/task-node";

export interface TaskTreeState {
  roots: TaskNode[];
  /** Zwischenablage: abgelegte Teilbäume (Spezial-Ast, persistiert wie Board-Wurzeln). */
  clipboardRoots: TaskNode[];
  /** Persistierter Pfad (DnD/Import); keine UI-Hervorhebung mehr. */
  pathIds: string[];
  /** Eingeklappte Knoten-IDs (Kinder ausgeblendet). */
  collapsedIds: string[];
  toggleNodeCollapsed: (nodeId: string) => void;
  /** Outline gesamt: auf `visibleLevels` Ebenen zu-/aufklappen (`null` = alles öffnen). */
  applyBoardDepthInView: (visibleLevels: number | null) => void;

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
  /** Tag überall umbenennen (Karten, Filter, Erledigt-Tag). */
  renameTagGlobally: (from: string, to: string) => void;

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
   * Pfad bis `nodeId` in der Outline aufklappen und Kontext auf den Parent setzen
   * (Treffer erscheint in der Kontext-Liste).
   */
  expandToNode: (nodeId: string) => void;

  /**
   * Drill-down-Kontext: `null` = Wurzelkarten in der Liste;
   * sonst Kinder von `contextNodeId`.
   */
  contextNodeId: string | null;
  setContextNodeId: (nodeId: string | null) => void;
  /** In diese Karte hinein (Kontext = nodeId). */
  drillIntoNode: (nodeId: string) => void;
  /** Eine Ebene nach oben. */
  drillUp: () => void;

  /** DnD innerhalb der Kontext-Liste (Reorder / Nest). */
  applyContextListDrag: (activeId: string, drop: ContextListDrop) => void;

  /** Einheitlicher DnD-Handler für Zwischenablage und Board→Zwischenablage. */
  applyUnifiedDrag: (activeId: string, drop: UnifiedDragDrop) => void;

  /** Zwischenablage vollständig leeren. */
  clearClipboard: () => void;

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
    clipboardRoots?: TaskNode[];
  }) => void;
  /**
   * Teilbaum unter `parentId` einfügen (`null` = neue Wurzel am Ende).
   * IDs im `root` werden neu vergeben, um Kollisionen zu vermeiden.
   */
  importSubtreeRoot: (parentId: string | null, root: TaskNode) => void;
  /** Mehrere Karten unter `parentId` einfügen (`null` = Wurzel). Liefert die neuen IDs. */
  importPastedCards: (
    parentId: string | null,
    cards: { title: string; description: string }[],
  ) => string[];
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
    tags: defaultTagsForNewCard(get().filterTags),
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

function cleanupAfterSubtreeRemoved(
  state: TaskTreeState,
  removedIds: Set<string>,
  nextRoots: TaskNode[],
): Partial<TaskTreeState> {
  const collapsedIds = state.collapsedIds.filter((id) => !removedIds.has(id));
  return {
    roots: nextRoots,
    pathIds: normalizePathIds(nextRoots, state.pathIds),
    collapsedIds,
    contextNodeId: normalizeContextNodeId(nextRoots, state.contextNodeId),
  };
}

function moveBoardNodeToClipboard(
  state: TaskTreeState,
  nodeId: string,
  target?: ForestDropTarget,
): Partial<TaskTreeState> | null {
  const { next: boardNext, detached } = detachNodeById(state.roots, nodeId);
  if (!detached) return null;
  const removedIds = collectSubtreeNodeIds(detached);
  const nextRoots = refreshCalculatedEffortsInTree(boardNext, state.completedTag);
  const clipNext = refreshCalculatedEffortsInTree(
    insertIntoForest(state.clipboardRoots, detached, target),
    state.completedTag,
  );
  return {
    ...cleanupAfterSubtreeRemoved(state, removedIds, nextRoots),
    clipboardRoots: clipNext,
  };
}

export const useTaskTreeStore = create<TaskTreeState>((set, get) => ({
  roots: [],
  clipboardRoots: [],
  pathIds: [],
  collapsedIds: [],

  contextNodeId: null,

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

  renameTagGlobally: (from, to) => {
    const fromKey = tagKey(from);
    const toLabel = normalizeTagLabel(to);
    if (!toLabel || fromKey === tagKey(toLabel)) return;
    set((s) => {
      const roots = refreshCalculatedEffortsInTree(
        renameTagInForest(s.roots, from, toLabel),
        s.completedTag,
      );
      const clipboardRoots = refreshCalculatedEffortsInTree(
        renameTagInForest(s.clipboardRoots, from, toLabel),
        s.completedTag,
      );
      const completedTag =
        tagKey(s.completedTag) === fromKey ? normalizeCompletedTag(toLabel) : s.completedTag;
      const filterTags = s.filterTags
        .map((t) => (tagKey(t) === fromKey ? toLabel : t))
        .filter((t, i, arr) => arr.findIndex((x) => tagKey(x) === tagKey(t)) === i);
      return { roots, clipboardRoots, completedTag, filterTags };
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

  applyBoardDepthInView: (visibleLevels) => {
    set((s) => {
      if (s.roots.length === 0) return {};
      const collapsedIds = collapsedIdsAfterBoardDepthAction(s.collapsedIds, s.roots, visibleLevels);
      if (
        collapsedIds.length === s.collapsedIds.length &&
        collapsedIds.every((id, i) => id === s.collapsedIds[i])
      ) {
        return {};
      }
      return { collapsedIds };
    });
  },

  expandToNode: (nodeId) => {
    set((s) => {
      const path = pathFromRootToNode(s.roots, nodeId);
      if (!path) return {};
      const open = new Set(path);
      const collapsedIds = s.collapsedIds.filter((id) => !open.has(id));
      const contextNodeId = contextIdForRevealingNode(s.roots, nodeId);
      return { collapsedIds, contextNodeId };
    });
  },

  setContextNodeId: (nodeId) => {
    set((s) => {
      if (nodeId === null) return { contextNodeId: null };
      if (!findNodeById(s.roots, nodeId)) return {};
      const path = pathFromRootToNode(s.roots, nodeId);
      if (!path) return {};
      const open = new Set(path);
      const collapsedIds = s.collapsedIds.filter((id) => !open.has(id));
      return { contextNodeId: nodeId, collapsedIds };
    });
  },

  drillIntoNode: (nodeId) => {
    get().setContextNodeId(nodeId);
  },

  drillUp: () => {
    set((s) => {
      if (!s.contextNodeId) return {};
      const parent = findDirectParentId(s.roots, s.contextNodeId);
      if (parent === undefined) return { contextNodeId: null };
      return { contextNodeId: parent };
    });
  },

  applyContextListDrag: (activeId, drop) => {
    set((s) => {
      const nextRoots = refreshCalculatedEffortsInTree(
        applyContextListDrop(s.roots, s.contextNodeId, activeId, drop),
        s.completedTag,
      );
      const nextPath = pathIdsAfterNodeMove(nextRoots, activeId, s.pathIds);
      return {
        roots: nextRoots,
        pathIds: nextPath,
        contextNodeId: normalizeContextNodeId(nextRoots, s.contextNodeId),
      };
    });
  },

  applyUnifiedDrag: (activeId, drop) => {
    set((s) => {
      const location = findNodeForestLocation(s.roots, s.clipboardRoots, activeId);
      if (!location) return {};

      if (drop.type === "to-clipboard-end") {
        return moveBoardNodeToClipboard(s, activeId) ?? {};
      }

      if (drop.type === "to-clipboard") {
        return moveBoardNodeToClipboard(s, activeId, drop.target) ?? {};
      }

      if (drop.type === "within-clipboard") {
        const node = findNodeById(s.clipboardRoots, activeId);
        if (!node) return {};
        const clipNext = refreshCalculatedEffortsInTree(
          applyForestDrop(s.clipboardRoots, activeId, drop.target),
          s.completedTag,
        );
        return { clipboardRoots: clipNext };
      }

      if (drop.type === "from-clipboard-to-context") {
        const { next: clipNext, detached } = detachNodeById(s.clipboardRoots, activeId);
        if (!detached) return {};
        const boardNext = refreshCalculatedEffortsInTree(
          insertNodeIntoContextList(s.roots, s.contextNodeId, detached, drop.drop),
          s.completedTag,
        );
        if (boardNext === s.roots) return {};
        const nextPath = pathIdsAfterNodeMove(boardNext, detached.id, s.pathIds);
        return {
          roots: boardNext,
          pathIds: nextPath,
          clipboardRoots: refreshCalculatedEffortsInTree(clipNext, s.completedTag),
          contextNodeId: normalizeContextNodeId(boardNext, s.contextNodeId),
        };
      }

      return {};
    });
  },

  clearClipboard: () => {
    set({ clipboardRoots: [] });
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
      return {
        roots: nextRoots,
        pathIds: normalizePathIds(nextRoots, s.pathIds),
        collapsedIds,
        contextNodeId: normalizeContextNodeId(nextRoots, s.contextNodeId),
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
    const hadCollapsedInPayload = payload.collapsedIds !== undefined;
    const collapsedIds = hadCollapsedInPayload
      ? (payload.collapsedIds ?? []).filter((x): x is string => typeof x === "string")
      : defaultBoardCollapsedIds(roots);
    set({
      roots,
      pathIds,
      collapsedIds,
      contextNodeId: null,
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
      clipboardRoots: payload.clipboardRoots ?? [],
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

  importPastedCards: (parentId, cards) => {
    if (cards.length === 0) return [];
    const createdIds: string[] = [];
    set((s) => {
      if (parentId !== null && !findNodeById(s.roots, parentId)) return {};
      let nextRoots = s.roots;
      const taken = collectAllNodeIds(nextRoots);
      const startIndex = getSiblingsList(nextRoots, parentId).length;
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i]!;
        const id = generateUniqueTaskIdFromTaken(taken);
        taken.add(id);
        createdIds.push(id);
        const newNode: TaskNode = {
          id,
          title: card.title,
          link: "",
          description: card.description,
          tags: defaultTagsForNewCard(s.filterTags),
          dueDate: null,
          reminderDate: null,
          effort: 0,
          effortUnit: "hours",
          effortSource: "manual",
          children: [],
        };
        nextRoots = insertUnderParent(nextRoots, parentId, startIndex + i, newNode);
      }
      const refreshed = refreshCalculatedEffortsInTree(nextRoots, s.completedTag);
      return { roots: refreshed, pathIds: normalizePathIds(refreshed, s.pathIds) };
    });
    return createdIds;
  },
}));

export function getNodeOrNull(roots: TaskNode[], id: string): TaskNode | null {
  return findNodeById(roots, id);
}
