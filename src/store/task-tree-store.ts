import { create } from "zustand";
import { temporal } from "zundo";

import {
  contextIdForRevealingNode,
} from "@/lib/board-context";
import {
  DEFAULT_PANE_CONTEXTS,
  normalizePaneContexts,
  type BoardPaneId,
  type PaneContexts,
} from "@/lib/board-pane";
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
import { applyOutlineDrop, insertNodeIntoOutline, type OutlineDrop } from "@/lib/outline-dnd";
import { convertCardToNoteInForest } from "@/lib/note-merge";
import { refreshCalculatedEffortsInTree } from "@/lib/task-effort";
import { collectAllNodeIds, generateUniqueTaskId, generateUniqueTaskIdFromTaken } from "@/lib/task-id";
import { remapTaskNodeForest, remapTaskNodeIds } from "@/lib/task-tree-json";
import {
  collapsedIdsAfterBoardDepthAction,
  defaultBoardCollapsedIds,
} from "@/lib/tree-depth-collapse";
import type { CardInteractionMode } from "@/lib/card-expand";
import {
  defaultColorForNewCard,
  parseFilterColors,
  parseFilterCombineMode,
  parseScheduleFilterKinds,
  type FilterCombineMode,
  type ScheduleFilterKind,
} from "@/lib/board-filters";
import type { CardColorId } from "@/lib/card-color";
import {
  DEFAULT_NOTE_ACCENT,
  parseNoteAccent,
  type NoteAccentId,
} from "@/lib/note-accent";
import {
  DEFAULT_COMPLETED_TAG,
  defaultTagsForNewCard,
  normalizeCompletedTag,
  normalizeTagLabel,
  renameTagInForest,
  tagKey,
} from "@/lib/task-tags";
import type { NoteEditableFields, TaskCardEditableFields, TaskNode } from "@/types/task-node";
import { createBlankCardNode, createBlankNoteNode } from "@/lib/tree-node-kind";

/** Felder, die in der Undo-/Redo-Historie liegen (persistierter Board-Stand, ohne Drill-Kontext). */
export type BoardHistorySlice = {
  roots: TaskNode[];
  clipboardRoots: TaskNode[];
  pathIds: string[];
  collapsedIds: string[];
  cardCollapsedIds: string[];
  cardInteractionMode: CardInteractionMode;
  hideCompletedTasks: boolean;
  completedTag: string;
  filterTags: string[];
  filterExcludeTags: string[];
  filterColors: CardColorId[];
  filterScheduleKinds: ScheduleFilterKind[];
  filterCombineMode: FilterCombineMode;
  cardFieldVisibility: CardFieldVisibility;
  effortOnTasksEnabled: boolean;
  noteAccentColor: NoteAccentId;
  columnTitleOverrides: Record<number, string>;
};

function partializeBoardHistory(state: TaskTreeState): BoardHistorySlice {
  return {
    roots: state.roots,
    clipboardRoots: state.clipboardRoots,
    pathIds: state.pathIds,
    collapsedIds: state.collapsedIds,
    cardCollapsedIds: state.cardCollapsedIds,
    cardInteractionMode: state.cardInteractionMode,
    hideCompletedTasks: state.hideCompletedTasks,
    completedTag: state.completedTag,
    filterTags: state.filterTags,
    filterExcludeTags: state.filterExcludeTags,
    filterColors: state.filterColors,
    filterScheduleKinds: state.filterScheduleKinds,
    filterCombineMode: state.filterCombineMode,
    cardFieldVisibility: state.cardFieldVisibility,
    effortOnTasksEnabled: state.effortOnTasksEnabled,
    noteAccentColor: state.noteAccentColor,
    columnTitleOverrides: state.columnTitleOverrides,
  };
}

function boardHistoryEqual(a: BoardHistorySlice, b: BoardHistorySlice): boolean {
  return (
    a.roots === b.roots &&
    a.clipboardRoots === b.clipboardRoots &&
    a.pathIds === b.pathIds &&
    a.collapsedIds === b.collapsedIds &&
    a.cardCollapsedIds === b.cardCollapsedIds &&
    a.cardInteractionMode === b.cardInteractionMode &&
    a.hideCompletedTasks === b.hideCompletedTasks &&
    a.completedTag === b.completedTag &&
    a.filterTags === b.filterTags &&
    a.filterExcludeTags === b.filterExcludeTags &&
    a.filterColors === b.filterColors &&
    a.filterScheduleKinds === b.filterScheduleKinds &&
    a.filterCombineMode === b.filterCombineMode &&
    a.cardFieldVisibility === b.cardFieldVisibility &&
    a.effortOnTasksEnabled === b.effortOnTasksEnabled &&
    a.noteAccentColor === b.noteAccentColor &&
    a.columnTitleOverrides === b.columnTitleOverrides
  );
}

function normalizeFilterTagList(tags: string[]): string[] {
  return tags
    .map((t) => normalizeTagLabel(t))
    .filter(Boolean)
    .filter((t, i, arr) => arr.findIndex((x) => tagKey(x) === tagKey(t)) === i);
}

export interface TaskTreeState {
  roots: TaskNode[];
  /** Zwischenablage: abgelegte Teilbäume (Spezial-Ast, persistiert wie Board-Wurzeln). */
  clipboardRoots: TaskNode[];
  /** Persistierter Pfad (DnD/Import); keine UI-Hervorhebung mehr. */
  pathIds: string[];
  /** Eingeklappte Knoten-IDs in der Struktur-Leiste (Kinder ausgeblendet). */
  collapsedIds: string[];
  toggleNodeCollapsed: (nodeId: string) => void;
  /** Struktur-Leiste: auf `visibleLevels` Ebenen zu-/aufklappen (`null` = alles öffnen). */
  applyBoardDepthInView: (visibleLevels: number | null) => void;

  /**
   * Eingeklappte Knoten-IDs in der Kartenansicht (unabhängig von der Struktur-Leiste).
   * Nur im Modus `expand` sichtbar als verschachtelte Listen.
   */
  cardCollapsedIds: string[];
  toggleCardCollapsed: (nodeId: string) => void;
  /** Kartenansicht: auf `visibleLevels` Ebenen zu-/aufklappen (`null` = alles öffnen). */
  applyCardDepthInView: (visibleLevels: number | null) => void;
  /**
   * `navigate` = Doppelklick/Icon springt in den Ast (Drill);
   * `expand` = Ast lokal aufklappen (mehrere Äste gleichzeitig sichtbar).
   */
  cardInteractionMode: CardInteractionMode;
  setCardInteractionMode: (mode: CardInteractionMode) => void;

  /** Erledigte Karten in Spaltenansicht ausblenden (nur Anzeige). */
  hideCompletedTasks: boolean;
  setHideCompletedTasks: (hide: boolean) => void;

  /** Tag-Name, der eine Karte als erledigt markiert (Groß-/Kleinschreibung egal). */
  completedTag: string;
  setCompletedTag: (tag: string) => void;

  /**
   * Tag-Filter inklusiv (jedes Tag ein Kriterium; Verknüpfung per filterCombineMode).
   * Zusammen mit `filterExcludeTags`; neutrale Tags fehlen in beiden Listen.
   */
  filterTags: string[];
  setFilterTags: (tags: string[]) => void;
  addFilterTag: (tag: string) => void;
  removeFilterTag: (tag: string) => void;
  /** Tag-Filter exklusiv (NOT — Karte darf das Tag nicht haben). */
  filterExcludeTags: string[];
  setFilterExcludeTags: (tags: string[]) => void;
  addFilterExcludeTag: (tag: string) => void;
  removeFilterExcludeTag: (tag: string) => void;
  /** Tag-Filterzustand: neutral → inklusiv → exklusiv → neutral. */
  cycleFilterTag: (tag: string) => void;
  /** Farbfilter: jede Farbe ist ein eigenes Kriterium. */
  filterColors: CardColorId[];
  setFilterColors: (colors: CardColorId[]) => void;
  addFilterColor: (color: CardColorId) => void;
  removeFilterColor: (color: CardColorId) => void;
  /** Terminfilter: Fälligkeit / Erinnerung je als eigenes Kriterium. */
  filterScheduleKinds: ScheduleFilterKind[];
  setFilterScheduleKinds: (kinds: ScheduleFilterKind[]) => void;
  addFilterScheduleKind: (kind: ScheduleFilterKind) => void;
  removeFilterScheduleKind: (kind: ScheduleFilterKind) => void;
  /**
   * Verknüpfung der Filterkriterien (Tag-Gruppe, jede Farbe, jede Terminart).
   * `and` = alle Kriterien müssen erfüllt sein; `or` = mindestens eines reicht.
   */
  filterCombineMode: FilterCombineMode;
  setFilterCombineMode: (mode: FilterCombineMode) => void;
  /** Alle Kartenfilter (Tags, Farben, Termine) zurücksetzen. */
  clearBoardFilters: () => void;
  /** Tag überall umbenennen (Karten, Filter, Erledigt-Tag). */
  renameTagGlobally: (from: string, to: string) => void;

  /** Sichtbare Kartenfelder (außer Titel) in Karten- und Detailansicht. */
  cardFieldVisibility: CardFieldVisibility;
  applyCardFieldVisibility: (next: CardFieldVisibility) => void;

  /** Wenn aus: keine Stunden-Eingabe und keine Aufwands-Anzeige (inkl. Σ). */
  effortOnTasksEnabled: boolean;
  setEffortOnTasksEnabled: (on: boolean) => void;

  /** Akzentfarbe für Notiz-Karten (Chrome). */
  noteAccentColor: NoteAccentId;
  setNoteAccentColor: (color: NoteAccentId) => void;

  /** Anzeige-Namen der Spalten (Index → Titel); leer / gleich Standard → nicht gesetzt. */
  columnTitleOverrides: Record<number, string>;
  /** Setzt die sichtbaren Spalten-Titel aus einem Dialog-Entwurf (Länge = Anzahl Spalten). */
  applyColumnTitleDraft: (draft: string[]) => void;

  /**
   * Pfad bis `nodeId` in der Outline aufklappen und Kontext auf den Parent setzen
   * (Treffer erscheint in der Kontext-Liste unter den Geschwistern — z. B. Suche).
   */
  expandToNode: (nodeId: string) => void;

  /**
   * Drill-down-Kontext der aktiven Pane (`null` = Wurzelkarten).
   * Gespiegelt aus `contextByPane[activePane]` für bestehende Call-Sites.
   */
  contextNodeId: string | null;
  /** Unabhängiger Drill-Kontext je Hälfte. */
  contextByPane: PaneContexts;
  activePane: BoardPaneId;
  setActivePane: (pane: BoardPaneId) => void;
  /** Geteilte Hauptansicht (zwei identische Panes); Standard an. */
  splitViewEnabled: boolean;
  setSplitViewEnabled: (on: boolean) => void;
  setContextNodeId: (nodeId: string | null, pane?: BoardPaneId) => void;
  /** In diese Karte hinein (Kontext = nodeId). */
  drillIntoNode: (nodeId: string, pane?: BoardPaneId) => void;
  /** Eine Ebene nach oben. */
  drillUp: (pane?: BoardPaneId) => void;

  /** DnD innerhalb der Kontext-Liste (Reorder / Nest). */
  applyContextListDrag: (activeId: string, drop: ContextListDrop) => void;

  /** DnD in der Struktur-Leiste (gesamter Baum). */
  applyOutlineDrag: (activeId: string, drop: OutlineDrop) => void;

  /** Einheitlicher DnD-Handler für Zwischenablage und Board→Zwischenablage. */
  applyUnifiedDrag: (activeId: string, drop: UnifiedDragDrop) => void;

  /** Zwischenablage vollständig leeren. */
  clearClipboard: () => void;

  /** Neue Karte am Ende der Geschwisterliste unter `parentId` (`null` = Wurzel). Liefert die neue ID. */
  addCardAfter: (parentId: string | null) => string;
  /** Neue Geschwisterkarte direkt unter `afterNodeId`. */
  addCardAfterSibling: (afterNodeId: string) => string | null;
  /** Neue Notiz am Ende der Geschwisterliste unter `parentId` (`null` = Wurzel). */
  addNoteAfter: (parentId: string | null) => string;
  /** Neue Geschwisternotiz direkt unter `afterNodeId`. */
  addNoteAfterSibling: (afterNodeId: string) => string | null;
  updateCard: (nodeId: string, fields: Partial<TaskCardEditableFields>) => void;
  updateNote: (nodeId: string, fields: Partial<NoteEditableFields>) => void;
  /** Karte in Markdown-Notiz umwandeln (Beschreibung → Markdown). */
  convertCardToNote: (nodeId: string) => void;
  /** Entfernt die Karte inkl. gesamtem Unterbaum. */
  removeCard: (nodeId: string) => void;

  /** Gesamten Board-Zustand aus Import ersetzen (Karten, Pfad, Ebenen-Namen, Einstellungen). */
  replaceBoardFromImport: (payload: {
    roots: TaskNode[];
    pathIds: string[];
    collapsedIds?: string[];
    cardCollapsedIds?: string[];
    cardInteractionMode?: CardInteractionMode;
    columnTitleOverrides: Record<number, string>;
    hideCompletedTasks?: boolean;
    completedTag?: string;
    filterTags?: string[];
    filterExcludeTags?: string[];
    filterColors?: CardColorId[];
    filterScheduleKinds?: ScheduleFilterKind[];
    filterCombineMode?: FilterCombineMode;
    cardFieldVisibility?: CardFieldVisibility;
    effortOnTasksEnabled?: boolean;
    noteAccentColor?: NoteAccentId;
    clipboardRoots?: TaskNode[];
  }) => void;
  /**
   * Teilbaum unter `parentId` einfügen (`null` = neue Wurzel am Ende).
   * IDs im `root` werden neu vergeben, um Kollisionen zu vermeiden.
   */
  importSubtreeRoot: (parentId: string | null, root: TaskNode) => void;
  /**
   * Vorlage unter `parentId` einfügen.
   * `children`: Kinder der Vorlagen-Wurzel (oder die Wurzel selbst, wenn blatt).
   * `wrapper`: ganze Vorlagen-Wurzel als eine Unterkarte.
   * Liefert die Anzahl eingefügter Karten (Knoten gesamt).
   */
  applyTemplateUnder: (
    parentId: string,
    root: TaskNode,
    mode: "children" | "wrapper",
  ) => number;
  /** Mehrere Karten unter `parentId` einfügen (`null` = Wurzel). Liefert die neuen IDs. */
  importPastedCards: (
    parentId: string | null,
    cards: { title: string; description: string }[],
  ) => string[];
}

function insertNodeAtIndex(
  set: (fn: (s: TaskTreeState) => Partial<TaskTreeState>) => void,
  get: () => TaskTreeState,
  parentId: string | null,
  index: number,
  newNode: TaskNode,
): string {
  set((s) => {
    const nextRoots = refreshCalculatedEffortsInTree(
      insertUnderParent(s.roots, parentId, index, newNode),
      s.completedTag,
    );
    return { roots: nextRoots, pathIds: normalizePathIds(nextRoots, s.pathIds) };
  });
  return newNode.id;
}

function insertCardAtIndex(
  set: (fn: (s: TaskTreeState) => Partial<TaskTreeState>) => void,
  get: () => TaskTreeState,
  parentId: string | null,
  index: number,
): string {
  const id = generateUniqueTaskId(get().roots);
  const state = get();
  const cardColor = defaultColorForNewCard(state.filterColors);
  const newNode = createBlankCardNode(id, {
    tags: defaultTagsForNewCard(state.filterTags),
    ...(cardColor ? { cardColor } : {}),
  });
  return insertNodeAtIndex(set, get, parentId, index, newNode);
}

function insertNoteAtIndex(
  set: (fn: (s: TaskTreeState) => Partial<TaskTreeState>) => void,
  get: () => TaskTreeState,
  parentId: string | null,
  index: number,
): string {
  const id = generateUniqueTaskId(get().roots);
  const newNode = createBlankNoteNode(id);
  return insertNodeAtIndex(set, get, parentId, index, newNode);
}

function syncActiveContext(
  contextByPane: PaneContexts,
  activePane: BoardPaneId,
): Pick<TaskTreeState, "contextByPane" | "contextNodeId" | "activePane"> {
  return {
    contextByPane,
    activePane,
    contextNodeId: contextByPane[activePane],
  };
}

function cleanupAfterSubtreeRemoved(
  state: TaskTreeState,
  removedIds: Set<string>,
  nextRoots: TaskNode[],
): Partial<TaskTreeState> {
  const collapsedIds = state.collapsedIds.filter((id) => !removedIds.has(id));
  const cardCollapsedIds = state.cardCollapsedIds.filter((id) => !removedIds.has(id));
  const contextByPane = normalizePaneContexts(nextRoots, state.contextByPane);
  return {
    roots: nextRoots,
    pathIds: normalizePathIds(nextRoots, state.pathIds),
    collapsedIds,
    cardCollapsedIds,
    ...syncActiveContext(contextByPane, state.activePane),
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

export const useTaskTreeStore = create<TaskTreeState>()(
  temporal(
    (set, get) => ({
  roots: [],
  clipboardRoots: [],
  pathIds: [],
  collapsedIds: [],
  cardCollapsedIds: [],
  cardInteractionMode: "expand",

  contextNodeId: null,
  contextByPane: { ...DEFAULT_PANE_CONTEXTS },
  activePane: "left",
  splitViewEnabled: false,

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
  filterExcludeTags: [],

  setFilterTags: (tags) => {
    const filterTags = normalizeFilterTagList(tags);
    set((s) => {
      const excludeKeys = new Set(filterTags.map(tagKey));
      return {
        filterTags,
        filterExcludeTags: s.filterExcludeTags.filter((t) => !excludeKeys.has(tagKey(t))),
      };
    });
  },

  addFilterTag: (tag) => {
    const label = normalizeTagLabel(tag);
    if (!label) return;
    set((s) => {
      const k = tagKey(label);
      const filterExcludeTags = s.filterExcludeTags.filter((t) => tagKey(t) !== k);
      if (s.filterTags.some((t) => tagKey(t) === k)) {
        return filterExcludeTags === s.filterExcludeTags ? {} : { filterExcludeTags };
      }
      return { filterTags: [...s.filterTags, label], filterExcludeTags };
    });
  },

  removeFilterTag: (tag) => {
    const k = tagKey(tag);
    set((s) => {
      const filterTags = s.filterTags.filter((t) => tagKey(t) !== k);
      return { filterTags };
    });
  },

  setFilterExcludeTags: (tags) => {
    const filterExcludeTags = normalizeFilterTagList(tags);
    set((s) => {
      const excludeKeys = new Set(filterExcludeTags.map(tagKey));
      return {
        filterExcludeTags,
        filterTags: s.filterTags.filter((t) => !excludeKeys.has(tagKey(t))),
      };
    });
  },

  addFilterExcludeTag: (tag) => {
    const label = normalizeTagLabel(tag);
    if (!label) return;
    set((s) => {
      const k = tagKey(label);
      const filterTags = s.filterTags.filter((t) => tagKey(t) !== k);
      if (s.filterExcludeTags.some((t) => tagKey(t) === k)) {
        return filterTags === s.filterTags ? {} : { filterTags };
      }
      return { filterExcludeTags: [...s.filterExcludeTags, label], filterTags };
    });
  },

  removeFilterExcludeTag: (tag) => {
    const k = tagKey(tag);
    set((s) => ({
      filterExcludeTags: s.filterExcludeTags.filter((t) => tagKey(t) !== k),
    }));
  },

  cycleFilterTag: (tag) => {
    const label = normalizeTagLabel(tag);
    if (!label) return;
    const k = tagKey(label);
    set((s) => {
      const included = s.filterTags.some((t) => tagKey(t) === k);
      const excluded = s.filterExcludeTags.some((t) => tagKey(t) === k);
      const withoutInclude = s.filterTags.filter((t) => tagKey(t) !== k);
      const withoutExclude = s.filterExcludeTags.filter((t) => tagKey(t) !== k);
      if (!included && !excluded) {
        return { filterTags: [...withoutInclude, label], filterExcludeTags: withoutExclude };
      }
      if (included) {
        return { filterTags: withoutInclude, filterExcludeTags: [...withoutExclude, label] };
      }
      return { filterTags: withoutInclude, filterExcludeTags: withoutExclude };
    });
  },

  filterColors: [],

  setFilterColors: (colors) => {
    set({ filterColors: parseFilterColors(colors) });
  },

  addFilterColor: (color) => {
    set((s) => {
      if (s.filterColors.includes(color)) return {};
      return { filterColors: [...s.filterColors, color] };
    });
  },

  removeFilterColor: (color) => {
    set((s) => ({
      filterColors: s.filterColors.filter((c) => c !== color),
    }));
  },

  filterScheduleKinds: [],

  setFilterScheduleKinds: (kinds) => {
    set({ filterScheduleKinds: parseScheduleFilterKinds(kinds) });
  },

  addFilterScheduleKind: (kind) => {
    set((s) => {
      if (s.filterScheduleKinds.includes(kind)) return {};
      return { filterScheduleKinds: [...s.filterScheduleKinds, kind] };
    });
  },

  removeFilterScheduleKind: (kind) => {
    set((s) => ({
      filterScheduleKinds: s.filterScheduleKinds.filter((k) => k !== kind),
    }));
  },

  filterCombineMode: "and",

  setFilterCombineMode: (mode) => {
    set({ filterCombineMode: parseFilterCombineMode(mode) });
  },

  clearBoardFilters: () => {
    set({
      filterTags: [],
      filterExcludeTags: [],
      filterColors: [],
      filterScheduleKinds: [],
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
      const filterTags = normalizeFilterTagList(
        s.filterTags.map((t) => (tagKey(t) === fromKey ? toLabel : t)),
      );
      const filterExcludeTags = normalizeFilterTagList(
        s.filterExcludeTags.map((t) => (tagKey(t) === fromKey ? toLabel : t)),
      ).filter((t) => !filterTags.some((inc) => tagKey(inc) === tagKey(t)));
      return { roots, clipboardRoots, completedTag, filterTags, filterExcludeTags };
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

  noteAccentColor: DEFAULT_NOTE_ACCENT,

  setNoteAccentColor: (color) => {
    set({ noteAccentColor: parseNoteAccent(color) });
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

  toggleCardCollapsed: (nodeId) => {
    set((s) => {
      const has = s.cardCollapsedIds.includes(nodeId);
      const cardCollapsedIds = has
        ? s.cardCollapsedIds.filter((id) => id !== nodeId)
        : [...s.cardCollapsedIds, nodeId];
      return { cardCollapsedIds };
    });
  },

  applyCardDepthInView: (visibleLevels) => {
    set((s) => {
      if (s.roots.length === 0) return {};
      const cardCollapsedIds = collapsedIdsAfterBoardDepthAction(
        s.cardCollapsedIds,
        s.roots,
        visibleLevels,
      );
      if (
        cardCollapsedIds.length === s.cardCollapsedIds.length &&
        cardCollapsedIds.every((id, i) => id === s.cardCollapsedIds[i])
      ) {
        return {};
      }
      return { cardCollapsedIds };
    });
  },

  setCardInteractionMode: (mode) => {
    set({ cardInteractionMode: mode });
  },

  expandToNode: (nodeId) => {
    set((s) => {
      const path = pathFromRootToNode(s.roots, nodeId);
      if (!path) return {};
      const open = new Set(path);
      const nextCollapsed = s.collapsedIds.filter((id) => !open.has(id));
      const nextCardCollapsed = s.cardCollapsedIds.filter((id) => !open.has(id));
      const collapsedUnchanged =
        nextCollapsed.length === s.collapsedIds.length &&
        nextCollapsed.every((id, i) => id === s.collapsedIds[i]);
      const cardCollapsedUnchanged =
        nextCardCollapsed.length === s.cardCollapsedIds.length &&
        nextCardCollapsed.every((id, i) => id === s.cardCollapsedIds[i]);
      const nextContext = contextIdForRevealingNode(s.roots, nodeId);
      const contextByPane = { ...s.contextByPane, [s.activePane]: nextContext };
      return {
        ...syncActiveContext(contextByPane, s.activePane),
        ...(collapsedUnchanged ? {} : { collapsedIds: nextCollapsed }),
        ...(cardCollapsedUnchanged ? {} : { cardCollapsedIds: nextCardCollapsed }),
      };
    });
  },

  setActivePane: (pane) => {
    set((s) => {
      if (s.activePane === pane) return {};
      return syncActiveContext(s.contextByPane, pane);
    });
  },

  setSplitViewEnabled: (on) => {
    set((s) => {
      if (s.splitViewEnabled === on) return {};
      if (!on) {
        return { splitViewEnabled: false, ...syncActiveContext(s.contextByPane, s.activePane) };
      }
      return { splitViewEnabled: true };
    });
  },

  setContextNodeId: (nodeId, pane) => {
    set((s) => {
      const targetPane = pane ?? s.activePane;
      if (nodeId === null) {
        const contextByPane = { ...s.contextByPane, [targetPane]: null };
        return syncActiveContext(contextByPane, s.activePane);
      }
      if (!findNodeById(s.roots, nodeId)) return {};
      const path = pathFromRootToNode(s.roots, nodeId);
      if (!path) return {};
      const open = new Set(path);
      const nextCollapsed = s.collapsedIds.filter((id) => !open.has(id));
      const nextCardCollapsed = s.cardCollapsedIds.filter((id) => !open.has(id));
      const collapsedUnchanged =
        nextCollapsed.length === s.collapsedIds.length &&
        nextCollapsed.every((id, i) => id === s.collapsedIds[i]);
      const cardCollapsedUnchanged =
        nextCardCollapsed.length === s.cardCollapsedIds.length &&
        nextCardCollapsed.every((id, i) => id === s.cardCollapsedIds[i]);
      const contextByPane = { ...s.contextByPane, [targetPane]: nodeId };
      return {
        ...syncActiveContext(contextByPane, s.activePane),
        ...(collapsedUnchanged ? {} : { collapsedIds: nextCollapsed }),
        ...(cardCollapsedUnchanged ? {} : { cardCollapsedIds: nextCardCollapsed }),
      };
    });
  },

  drillIntoNode: (nodeId, pane) => {
    get().setContextNodeId(nodeId, pane);
  },

  drillUp: (pane) => {
    set((s) => {
      const targetPane = pane ?? s.activePane;
      const current = s.contextByPane[targetPane];
      if (!current) return {};
      const parent = findDirectParentId(s.roots, current);
      const next = parent === undefined ? null : parent;
      const contextByPane = { ...s.contextByPane, [targetPane]: next };
      return syncActiveContext(contextByPane, s.activePane);
    });
  },

  applyContextListDrag: (activeId, drop) => {
    set((s) => {
      const nextRoots = refreshCalculatedEffortsInTree(
        applyContextListDrop(s.roots, s.contextNodeId, activeId, drop),
        s.completedTag,
      );
      const nextPath = pathIdsAfterNodeMove(nextRoots, activeId, s.pathIds);
      const contextByPane = normalizePaneContexts(nextRoots, s.contextByPane);
      return {
        roots: nextRoots,
        pathIds: nextPath,
        ...syncActiveContext(contextByPane, s.activePane),
      };
    });
  },

  applyOutlineDrag: (activeId, drop) => {
    set((s) => {
      const nextRoots = refreshCalculatedEffortsInTree(
        applyOutlineDrop(s.roots, activeId, drop),
        s.completedTag,
      );
      if (nextRoots === s.roots) return {};
      const nextPath = pathIdsAfterNodeMove(nextRoots, activeId, s.pathIds);
      const contextByPane = normalizePaneContexts(nextRoots, s.contextByPane);
      return {
        roots: nextRoots,
        pathIds: nextPath,
        ...syncActiveContext(contextByPane, s.activePane),
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
        const contextByPane = normalizePaneContexts(boardNext, s.contextByPane);
        return {
          roots: boardNext,
          pathIds: nextPath,
          clipboardRoots: refreshCalculatedEffortsInTree(clipNext, s.completedTag),
          ...syncActiveContext(contextByPane, s.activePane),
        };
      }

      if (drop.type === "from-clipboard-to-outline") {
        const { next: clipNext, detached } = detachNodeById(s.clipboardRoots, activeId);
        if (!detached) return {};
        const boardNext = refreshCalculatedEffortsInTree(
          insertNodeIntoOutline(s.roots, detached, drop.drop),
          s.completedTag,
        );
        if (boardNext === s.roots) return {};
        const nextPath = pathIdsAfterNodeMove(boardNext, detached.id, s.pathIds);
        const contextByPane = normalizePaneContexts(boardNext, s.contextByPane);
        return {
          roots: boardNext,
          pathIds: nextPath,
          clipboardRoots: refreshCalculatedEffortsInTree(clipNext, s.completedTag),
          ...syncActiveContext(contextByPane, s.activePane),
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

  addNoteAfter: (parentId) => {
    const index = getSiblingsList(get().roots, parentId).length;
    return insertNoteAtIndex(set, get, parentId, index);
  },

  addNoteAfterSibling: (afterNodeId) => {
    const roots = get().roots;
    const parentId = findDirectParentId(roots, afterNodeId);
    if (parentId === undefined) return null;
    const sibs = getSiblingsList(roots, parentId);
    const idx = sibs.findIndex((n) => n.id === afterNodeId);
    const index = idx >= 0 ? idx + 1 : sibs.length;
    return insertNoteAtIndex(set, get, parentId, index);
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

  updateNote: (nodeId, fields) => {
    set((s) => {
      const nextRoots = updateNodeFields(s.roots, nodeId, fields);
      return {
        roots: nextRoots,
        pathIds: normalizePathIds(nextRoots, s.pathIds),
      };
    });
  },

  convertCardToNote: (nodeId) => {
    set((s) => {
      const node = findNodeById(s.roots, nodeId);
      if (!node || node.kind === "note") return {};
      const nextRoots = convertCardToNoteInForest(s.roots, nodeId);
      if (nextRoots === s.roots) return {};
      return {
        roots: nextRoots,
        pathIds: normalizePathIds(nextRoots, s.pathIds),
      };
    });
  },

  removeCard: (nodeId) => {
    set((s) => {
      const { next, detached } = detachNodeById(s.roots, nodeId);
      if (!detached) return {};
      const removedIds = collectSubtreeNodeIds(detached);
      const nextRoots = refreshCalculatedEffortsInTree(next, s.completedTag);
      const collapsedIds = s.collapsedIds.filter((id) => !removedIds.has(id));
      const cardCollapsedIds = s.cardCollapsedIds.filter((id) => !removedIds.has(id));
      const contextByPane = normalizePaneContexts(nextRoots, s.contextByPane);
      return {
        roots: nextRoots,
        pathIds: normalizePathIds(nextRoots, s.pathIds),
        collapsedIds,
        cardCollapsedIds,
        ...syncActiveContext(contextByPane, s.activePane),
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
      filterExcludeTags: incomingFilterExcludeTags,
      filterColors: incomingFilterColors,
      filterScheduleKinds: incomingFilterSchedule,
      filterCombineMode: incomingFilterCombine,
      cardFieldVisibility: incomingVisibility,
      effortOnTasksEnabled: incomingEffort,
      noteAccentColor: incomingNoteAccent,
    } = payload;
    const pathIds = normalizePathIds(roots, incomingPath);
    const hadCollapsedInPayload = payload.collapsedIds !== undefined;
    const collapsedIds = hadCollapsedInPayload
      ? (payload.collapsedIds ?? []).filter((x): x is string => typeof x === "string")
      : defaultBoardCollapsedIds(roots);
    const hadCardCollapsedInPayload = payload.cardCollapsedIds !== undefined;
    const cardCollapsedIds = hadCardCollapsedInPayload
      ? (payload.cardCollapsedIds ?? []).filter((x): x is string => typeof x === "string")
      : defaultBoardCollapsedIds(roots);
    const cardInteractionMode =
      payload.cardInteractionMode === "navigate" || payload.cardInteractionMode === "expand"
        ? payload.cardInteractionMode
        : ("expand" as const);
    set({
      roots,
      pathIds,
      collapsedIds,
      cardCollapsedIds,
      cardInteractionMode,
      ...syncActiveContext({ ...DEFAULT_PANE_CONTEXTS }, "left"),
      columnTitleOverrides,
      ...(typeof incomingHideDone === "boolean" ? { hideCompletedTasks: incomingHideDone } : {}),
      ...(typeof incomingCompletedTag === "string"
        ? { completedTag: normalizeCompletedTag(incomingCompletedTag) }
        : {}),
      ...(incomingFilterTags !== undefined
        ? {
            filterTags: normalizeFilterTagList(incomingFilterTags),
          }
        : {}),
      ...(incomingFilterExcludeTags !== undefined
        ? {
            filterExcludeTags: normalizeFilterTagList(incomingFilterExcludeTags),
          }
        : {}),
      ...(incomingFilterColors !== undefined
        ? { filterColors: parseFilterColors(incomingFilterColors) }
        : {}),
      ...(incomingFilterSchedule !== undefined
        ? { filterScheduleKinds: parseScheduleFilterKinds(incomingFilterSchedule) }
        : {}),
      ...(incomingFilterCombine !== undefined
        ? { filterCombineMode: parseFilterCombineMode(incomingFilterCombine) }
        : {}),
      cardFieldVisibility: mergeCardFieldVisibility(incomingVisibility),
      ...(typeof incomingEffort === "boolean" ? { effortOnTasksEnabled: incomingEffort } : {}),
      ...(incomingNoteAccent !== undefined
        ? { noteAccentColor: parseNoteAccent(incomingNoteAccent) }
        : {}),
      clipboardRoots: payload.clipboardRoots ?? [],
    });
  },

  importSubtreeRoot: (parentId, root) => {
    set((s) => {
      const takenNow = collectAllNodeIds([...s.roots, ...s.clipboardRoots]);
      const fresh = remapTaskNodeIds(root, takenNow);
      if (parentId !== null && !findNodeById(s.roots, parentId)) return {};
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
  },

  applyTemplateUnder: (parentId, root, mode) => {
    let insertedCount = 0;
    set((s) => {
      if (!findNodeById(s.roots, parentId)) return {};
      const taken = collectAllNodeIds([...s.roots, ...s.clipboardRoots]);
      const toInsert: TaskNode[] =
        mode === "wrapper"
          ? [root]
          : root.children.length > 0
            ? [...root.children]
            : [root];
      const fresh = remapTaskNodeForest(toInsert, taken);
      insertedCount = fresh.reduce((n, node) => n + collectSubtreeNodeIds(node).size, 0);
      let nextRoots = s.roots;
      let startIndex = getSiblingsList(nextRoots, parentId).length;
      for (const node of fresh) {
        nextRoots = insertUnderParent(nextRoots, parentId, startIndex, node);
        startIndex += 1;
      }
      nextRoots = refreshCalculatedEffortsInTree(nextRoots, s.completedTag);
      return { roots: nextRoots, pathIds: normalizePathIds(nextRoots, s.pathIds) };
    });
    return insertedCount;
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
        const cardColor = defaultColorForNewCard(s.filterColors);
        const newNode: TaskNode = {
          id,
          title: card.title,
          link: "",
          command: "",
          description: card.description,
          tags: defaultTagsForNewCard(s.filterTags),
          dueDate: null,
          reminderDate: null,
          effort: 0,
          effortUnit: "hours",
          effortSource: "manual",
          ...(cardColor ? { cardColor } : {}),
          children: [],
        };
        nextRoots = insertUnderParent(nextRoots, parentId, startIndex + i, newNode);
      }
      const refreshed = refreshCalculatedEffortsInTree(nextRoots, s.completedTag);
      return { roots: refreshed, pathIds: normalizePathIds(refreshed, s.pathIds) };
    });
    return createdIds;
  },
    }),
    {
      limit: 80,
      partialize: partializeBoardHistory,
      equality: boardHistoryEqual,
    },
  ),
);

/** Historie leeren (nach Datei laden / Board-Import). */
export function clearBoardHistory(): void {
  useTaskTreeStore.temporal.getState().clear();
}

/** Aktion ohne Historie-Eintrag ausführen und Stack danach leeren. */
export function runWithoutBoardHistory(fn: () => void): void {
  const temporalStore = useTaskTreeStore.temporal.getState();
  temporalStore.pause();
  try {
    fn();
  } finally {
    temporalStore.clear();
    temporalStore.resume();
  }
}

export function undoBoard(): void {
  useTaskTreeStore.temporal.getState().undo();
}

export function redoBoard(): void {
  useTaskTreeStore.temporal.getState().redo();
}

export function getNodeOrNull(roots: TaskNode[], id: string): TaskNode | null {
  return findNodeById(roots, id);
}
