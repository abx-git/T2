import { mergeCardFieldVisibility, parseCardFieldVisibilityFromJson, type CardFieldVisibility } from "@/lib/card-field-visibility";
import { parseCardColor, type CardColorId } from "@/lib/card-color";
import {
  parseFilterColors,
  parseFilterCombineMode,
  parseScheduleFilterKinds,
  type FilterCombineMode,
  type ScheduleFilterKind,
} from "@/lib/board-filters";
import {
  DEFAULT_EFFORT_UNIT,
  getEffortSource,
  getEffortUnit,
  parseEffortSource,
  parseEffortUnit,
} from "@/lib/task-effort";
import {
  DEFAULT_COMPLETED_TAG,
  normalizeCompletedTag,
  tagsFromLegacyStatus,
  uniqNonEmptyTags,
} from "@/lib/task-tags";
import { generateUniqueTaskIdFromTaken } from "@/lib/task-id";
import { normalizeTaskLink } from "@/lib/task-link";
import { normalizeTaskCommand } from "@/lib/task-command";
import type { TaskNode } from "@/types/task-node";
import hierarchicalTaskManagerExportV1Schema from "@/schemas/hierarchical-task-manager.export.v1.schema.json";

export const EXPORT_FORMAT = "hierarchical-task-manager" as const;
export const EXPORT_VERSION = 1 as const;

/** Dateiname für den Download des JSON-Schemas der Arbeitsdatei. */
export const EXPORT_SCHEMA_FILENAME = "hierarchical-task-manager.export.v1.schema.json";

/** JSON-Schema für Exportdokumente / interne Speicherung (Arbeitsdatei). */
export const EXPORT_SCHEMA_DOCUMENT = hierarchicalTaskManagerExportV1Schema;

type LegacyTaskStatus = "todo" | "in-progress" | "done";

const LEGACY_STATUSES: LegacyTaskStatus[] = ["todo", "in-progress", "done"];

function isLegacyTaskStatus(s: unknown): s is LegacyTaskStatus {
  return typeof s === "string" && LEGACY_STATUSES.includes(s as LegacyTaskStatus);
}

/** JSON-Darstellung eines Knotens (ISO-Datumstrings). */
export interface TaskNodeJson {
  id: string;
  title: string;
  link?: string;
  command?: string;
  description: string;
  tags?: string[];
  /** Nur Import älterer Exporte ohne `tags`. */
  status?: LegacyTaskStatus;
  dueDate: string | null;
  reminderDate: string | null;
  effort: number;
  effortUnit?: "hours" | "minutes" | "workdays";
  effortSource?: "manual" | "calculated";
  /** Optionale Kartenfarbe (Palette). */
  cardColor?: CardColorId;
  children: TaskNodeJson[];
}

/** Gespeicherte Teilbaum-Vorlage (Bibliothek / Board-Portabilität). */
export interface TemplateRecordV1 {
  id: string;
  name: string;
  description?: string;
  updatedAt: number;
  root: TaskNodeJson;
}

export interface BoardSnapshotV1 {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  scope: "board";
  roots: TaskNodeJson[];
  pathIds: string[];
  /** Eingeklappte Knoten in der Struktur-Leiste (Kinder ausgeblendet). */
  collapsedIds?: string[];
  /** Eingeklappte Knoten in der Kartenansicht (unabhängig von der Struktur). */
  cardCollapsedIds?: string[];
  /** Karten: Doppelklick/Icon springt hinein (`navigate`) oder klappt auf (`expand`). */
  cardInteractionMode?: "navigate" | "expand";
  /** JSON serialisiert Keys als String; beim Laden in Record<number, string> wandeln. */
  columnTitleOverrides: Record<string, string>;
  /** @deprecated Wird ignoriert; Spaltenansicht ist immer aktiv. */
  showFullTree?: boolean;
  /** Sichtbare Kartenfelder (außer Titel); optional für ältere Exporte. */
  cardFieldVisibility?: CardFieldVisibility;
  /** Erledigte Karten in der Ansicht ausblenden; optional, Standard false. */
  hideCompletedTasks?: boolean;
  /** Aktive Tag-Filter; optional, Standard leer. */
  filterTags?: string[];
  /** Aktive Farbfilter; optional, Standard leer. */
  filterColors?: CardColorId[];
  /** Aktive Terminfilter (Fälligkeit / Erinnerung); optional, Standard leer. */
  filterScheduleKinds?: ScheduleFilterKind[];
  /** Verknüpfung der Filter-Dimensionen; optional, Standard `and`. */
  filterCombineMode?: FilterCombineMode;
  /** Tag für „erledigt“; optional, Standard „Erledigt“. */
  completedTag?: string;
  /** Aufwand (Stunden) an Karten erlauben; optional, Standard true. */
  effortOnTasksEnabled?: boolean;
  /** Zwischenablage: abgelegte Teilbäume (Spezial-Ast). */
  clipboardRoots?: TaskNodeJson[];
  /** Vorlagen-Bibliothek (Portabilität mit der Arbeitsdatei). */
  templates?: TemplateRecordV1[];
}

export interface SubtreeSnapshotV1 {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  scope: "subtree";
  root: TaskNodeJson;
  sourceNodeId?: string;
  sourceNodeTitle?: string;
}

export type ExportedDocumentV1 = BoardSnapshotV1 | SubtreeSnapshotV1;

export function taskNodeToJson(node: TaskNode): TaskNodeJson {
  return {
    id: node.id,
    title: node.title,
    ...((node.link ?? "").trim() ? { link: (node.link ?? "").trim() } : {}),
    ...((node.command ?? "").trim() ? { command: normalizeTaskCommand(node.command ?? "") } : {}),
    description: node.description,
    tags: [...node.tags],
    dueDate: node.dueDate ? node.dueDate.toISOString() : null,
    reminderDate: node.reminderDate ? node.reminderDate.toISOString() : null,
    effort: node.effort,
    ...(getEffortUnit(node) !== DEFAULT_EFFORT_UNIT ? { effortUnit: getEffortUnit(node) } : {}),
    ...(getEffortSource(node) === "calculated" ? { effortSource: "calculated" } : {}),
    ...(node.cardColor ? { cardColor: node.cardColor } : {}),
    children: node.children.map(taskNodeToJson),
  };
}

export function taskNodeFromJson(j: TaskNodeJson): TaskNode {
  let tags = Array.isArray(j.tags) ? uniqNonEmptyTags(j.tags.filter((x): x is string => typeof x === "string")) : [];
  if (!tags.length && j.status !== undefined && isLegacyTaskStatus(j.status)) {
    tags = tagsFromLegacyStatus(j.status);
  }
  return {
    id: j.id,
    title: j.title,
    link: typeof j.link === "string" ? normalizeTaskLink(j.link) : "",
    ...(typeof j.command === "string" && normalizeTaskCommand(j.command)
      ? { command: normalizeTaskCommand(j.command) }
      : {}),
    description: j.description,
    tags,
    dueDate: j.dueDate ? new Date(j.dueDate) : null,
    reminderDate: j.reminderDate ? new Date(j.reminderDate) : null,
    effort: j.effort,
    ...(parseEffortUnit(j.effortUnit) ? { effortUnit: parseEffortUnit(j.effortUnit) } : {}),
    ...(parseEffortSource(j.effortSource) === "calculated" ? { effortSource: "calculated" } : {}),
    ...(parseCardColor(j.cardColor) ? { cardColor: parseCardColor(j.cardColor) } : {}),
    children: j.children.map(taskNodeFromJson),
  };
}

/**
 * Alle IDs neu vergeben (z. B. nach JSON-Import eines Teilbaums).
 * Optional `taken` mit bereits belegten IDs (Board + Zwischenablage) vorausfüllen —
 * das Set wird in-place um die neuen IDs ergänzt.
 */
export function remapTaskNodeIds(root: TaskNode, taken?: Set<string>): TaskNode {
  const used = taken ?? new Set<string>();
  function walk(n: TaskNode): TaskNode {
    const id = generateUniqueTaskIdFromTaken(used);
    used.add(id);
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

/** Mehrere Wurzeln remappen; `taken` wird fortgeschrieben. */
export function remapTaskNodeForest(roots: TaskNode[], taken?: Set<string>): TaskNode[] {
  const used = taken ?? new Set<string>();
  return roots.map((r) => remapTaskNodeIds(r, used));
}

function parseBoardTemplateRecord(raw: unknown, path: string): TemplateRecordV1 {
  const o = expectObject(raw, `${path}: Objekt erwartet`);
  if (typeof o.id !== "string" || !o.id.trim()) {
    throw new Error(`${path}.id: nicht-leere Zeichenkette erwartet`);
  }
  if (typeof o.name !== "string" || !o.name.trim()) {
    throw new Error(`${path}.name: nicht-leere Zeichenkette erwartet`);
  }
  if (typeof o.updatedAt !== "number" || !Number.isFinite(o.updatedAt)) {
    throw new Error(`${path}.updatedAt: Zahl erwartet`);
  }
  if (o.description !== undefined && typeof o.description !== "string") {
    throw new Error(`${path}.description: Zeichenkette erwartet`);
  }
  return {
    id: o.id.trim(),
    name: o.name.trim(),
    ...(typeof o.description === "string" && o.description.trim()
      ? { description: o.description.trim() }
      : {}),
    updatedAt: o.updatedAt,
    root: expectTaskNodeJson(o.root, `${path}.root`),
  };
}

function parseBoardTemplates(raw: unknown[]): TemplateRecordV1[] {
  const out: TemplateRecordV1[] = [];
  for (let i = 0; i < raw.length; i++) {
    try {
      out.push(parseBoardTemplateRecord(raw[i], `templates[${i}]`));
    } catch {
      /* skip invalid */
    }
  }
  return out;
}

export function parseColumnTitleOverridesFromJson(
  raw: unknown,
): Record<number, string> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<number, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const idx = Number(k);
    if (!Number.isFinite(idx)) continue;
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (t) out[idx] = t;
  }
  return out;
}

function expectObject(x: unknown, msg: string): Record<string, unknown> {
  if (x == null || typeof x !== "object" || Array.isArray(x)) throw new Error(msg);
  return x as Record<string, unknown>;
}

function expectTaskNodeJson(raw: unknown, path: string): TaskNodeJson {
  const o = expectObject(raw, `${path}: Objekt erwartet`);
  const id = o.id;
  const title = o.title;
  const linkRaw = o.link;
  const commandRaw = o.command;
  const description = o.description;
  const tagsRaw = o.tags;
  const statusLegacy = o.status;
  const effort = o.effort;
  const effortUnitRaw = o.effortUnit;
  const effortSourceRaw = o.effortSource;
  const cardColorRaw = o.cardColor;
  const dueDate = o.dueDate;
  const reminderDate = o.reminderDate;
  const children = o.children;

  if (typeof id !== "string" || !id.trim()) throw new Error(`${path}.id: nicht-leere Zeichenkette erwartet`);
  if (typeof title !== "string") throw new Error(`${path}.title: Zeichenkette erwartet`);
  if (linkRaw !== undefined && typeof linkRaw !== "string") {
    throw new Error(`${path}.link: Zeichenkette erwartet`);
  }
  if (commandRaw !== undefined && typeof commandRaw !== "string") {
    throw new Error(`${path}.command: Zeichenkette erwartet`);
  }
  if (typeof description !== "string") throw new Error(`${path}.description: Zeichenkette erwartet`);

  let tags: string[];
  if (Array.isArray(tagsRaw)) {
    tags = uniqNonEmptyTags(tagsRaw.filter((x): x is string => typeof x === "string"));
    if (
      tags.length === 0 &&
      statusLegacy !== undefined &&
      isLegacyTaskStatus(statusLegacy)
    ) {
      tags = tagsFromLegacyStatus(statusLegacy);
    }
  } else if (statusLegacy !== undefined) {
    if (!isLegacyTaskStatus(statusLegacy)) throw new Error(`${path}.status: ungültiger Legacy-Status`);
    tags = tagsFromLegacyStatus(statusLegacy);
  } else {
    tags = [];
  }

  if (typeof effort !== "number" || !Number.isFinite(effort) || effort < 0) {
    throw new Error(`${path}.effort: nicht-negative Zahl erwartet`);
  }
  const effortUnit = parseEffortUnit(effortUnitRaw);
  if (effortUnitRaw !== undefined && effortUnit === undefined) {
    throw new Error(`${path}.effortUnit: hours, minutes oder workdays erwartet`);
  }
  const effortSource = parseEffortSource(effortSourceRaw);
  if (effortSourceRaw !== undefined && effortSource === undefined) {
    throw new Error(`${path}.effortSource: manual oder calculated erwartet`);
  }
  const cardColor = parseCardColor(cardColorRaw);
  if (cardColorRaw !== undefined && cardColor === undefined) {
    throw new Error(`${path}.cardColor: gültige Palettenfarbe erwartet`);
  }
  if (dueDate != null && typeof dueDate !== "string") throw new Error(`${path}.dueDate: null oder ISO-String`);
  if (reminderDate != null && typeof reminderDate !== "string") {
    throw new Error(`${path}.reminderDate: null oder ISO-String`);
  }
  if (!Array.isArray(children)) throw new Error(`${path}.children: Array erwartet`);

  let due: string | null = null;
  if (typeof dueDate === "string" && dueDate.trim()) {
    const d = new Date(dueDate);
    if (Number.isNaN(d.getTime())) throw new Error(`${path}.dueDate: ungültiges Datum`);
    due = dueDate;
  }
  let rem: string | null = null;
  if (typeof reminderDate === "string" && reminderDate.trim()) {
    const d = new Date(reminderDate);
    if (Number.isNaN(d.getTime())) throw new Error(`${path}.reminderDate: ungültiges Datum`);
    rem = reminderDate;
  }

  return {
    id,
    title,
    ...(typeof linkRaw === "string" && linkRaw.trim() ? { link: linkRaw } : {}),
    ...(typeof commandRaw === "string" && normalizeTaskCommand(commandRaw)
      ? { command: normalizeTaskCommand(commandRaw) }
      : {}),
    description,
    tags,
    dueDate: due,
    reminderDate: rem,
    effort,
    ...(effortUnit ? { effortUnit } : {}),
    ...(effortSource === "calculated" ? { effortSource } : {}),
    ...(cardColor ? { cardColor } : {}),
    children: children.map((ch, i) => expectTaskNodeJson(ch, `${path}.children[${i}]`)),
  };
}

export function parseExportedDocument(text: string): ExportedDocumentV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("Kein gültiges JSON.");
  }
  const root = expectObject(parsed, "Wurzel");

  const format = root.format;
  const version = root.version;

  if (format === EXPORT_FORMAT && version === EXPORT_VERSION) {
    const scope = root.scope;
    const exportedAtRaw = root.exportedAt;
    const exportedAt =
      typeof exportedAtRaw === "string" && exportedAtRaw.trim()
        ? exportedAtRaw
        : new Date().toISOString();

    if (scope === "board") {
      const rootsRaw = root.roots;
      const pathIdsRaw = root.pathIds;
      if (!Array.isArray(rootsRaw)) throw new Error("roots: Array erwartet");
      const roots = rootsRaw.map((r, i) => expectTaskNodeJson(r, `roots[${i}]`));
      const pathIds = Array.isArray(pathIdsRaw)
        ? pathIdsRaw.filter((x): x is string => typeof x === "string")
        : [];
      const collapsedIdsRaw = root.collapsedIds;
      const collapsedIds = Array.isArray(collapsedIdsRaw)
        ? collapsedIdsRaw.filter((x): x is string => typeof x === "string")
        : [];
      const cardCollapsedIdsRaw = root.cardCollapsedIds;
      const cardCollapsedIds = Array.isArray(cardCollapsedIdsRaw)
        ? cardCollapsedIdsRaw.filter((x): x is string => typeof x === "string")
        : [];
      const cardModeRaw = root.cardInteractionMode;
      const cardInteractionMode =
        cardModeRaw === "navigate" || cardModeRaw === "expand" ? cardModeRaw : undefined;
      const columnTitleOverrides = parseColumnTitleOverridesFromJson(root.columnTitleOverrides);
      const cardFieldVisibility = parseCardFieldVisibilityFromJson(root.cardFieldVisibility);
      const effortOn =
        typeof root.effortOnTasksEnabled === "boolean" ? root.effortOnTasksEnabled : undefined;
      return {
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        exportedAt,
        scope: "board",
        roots,
        pathIds,
        ...(collapsedIds.length ? { collapsedIds } : {}),
        ...(cardCollapsedIds.length ? { cardCollapsedIds } : {}),
        ...(cardInteractionMode ? { cardInteractionMode } : {}),
        columnTitleOverrides: Object.fromEntries(
          Object.entries(columnTitleOverrides).map(([k, v]) => [String(k), v]),
        ) as Record<string, string>,
        cardFieldVisibility,
        ...(typeof root.hideCompletedTasks === "boolean"
          ? { hideCompletedTasks: root.hideCompletedTasks }
          : {}),
        ...(Array.isArray(root.filterTags)
          ? {
              filterTags: root.filterTags.filter((x): x is string => typeof x === "string"),
            }
          : {}),
        ...(Array.isArray(root.filterColors)
          ? { filterColors: parseFilterColors(root.filterColors) }
          : {}),
        ...(Array.isArray(root.filterScheduleKinds)
          ? { filterScheduleKinds: parseScheduleFilterKinds(root.filterScheduleKinds) }
          : {}),
        ...(root.filterCombineMode === "and" || root.filterCombineMode === "or"
          ? { filterCombineMode: root.filterCombineMode }
          : {}),
        ...(typeof root.completedTag === "string" && root.completedTag.trim()
          ? { completedTag: normalizeCompletedTag(root.completedTag) }
          : {}),
        ...(effortOn !== undefined ? { effortOnTasksEnabled: effortOn } : {}),
        ...(Array.isArray(root.clipboardRoots)
          ? {
              clipboardRoots: (root.clipboardRoots as unknown[]).map((r, i) =>
                expectTaskNodeJson(r, `clipboardRoots[${i}]`),
              ),
            }
          : {}),
        ...(Array.isArray(root.templates)
          ? { templates: parseBoardTemplates(root.templates as unknown[]) }
          : {}),
      };
    }

    if (scope === "subtree") {
      const rootNode = expectTaskNodeJson(root.root, "root");
      const sourceNodeId = root.sourceNodeId;
      const sourceNodeTitle = root.sourceNodeTitle;
      return {
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        exportedAt,
        scope: "subtree",
        root: rootNode,
        ...(typeof sourceNodeId === "string" ? { sourceNodeId } : {}),
        ...(typeof sourceNodeTitle === "string" ? { sourceNodeTitle } : {}),
      };
    }

    throw new Error("Unbekannter scope im Export.");
  }

  /** Legacy / minimal: nur `roots`-Array */
  if (Array.isArray(root.roots) && root.roots.length > 0 && root.scope == null) {
    const roots = (root.roots as unknown[]).map((r, i) => expectTaskNodeJson(r, `roots[${i}]`));
    return {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      scope: "board",
      roots,
      pathIds: [],
      columnTitleOverrides: {},
      cardFieldVisibility: parseCardFieldVisibilityFromJson(null),
    };
  }

  /** Minimal: einzelner Wurzelknoten unter `root` */
  if (root.root != null && typeof root.root === "object" && !Array.isArray(root.root)) {
    const rootNode = expectTaskNodeJson(root.root, "root");
    return {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      scope: "subtree",
      root: rootNode,
    };
  }

  throw new Error("Unbekanntes JSON-Format: weder Board- noch Teilbaum-Export erkannt.");
}

export function stringifyExportedDocument(doc: ExportedDocumentV1): string {
  return JSON.stringify(doc, null, 2);
}

export function buildBoardSnapshot(
  roots: TaskNode[],
  pathIds: string[],
  columnTitleOverrides: Record<number, string>,
  cardFieldVisibility: CardFieldVisibility,
  hideCompletedTasks: boolean,
  effortOnTasksEnabled: boolean,
  filterTags: string[] = [],
  completedTag: string = DEFAULT_COMPLETED_TAG,
  collapsedIds: string[] = [],
  clipboardRoots: TaskNode[] = [],
  templates: TemplateRecordV1[] = [],
  filterColors: CardColorId[] = [],
  filterScheduleKinds: ScheduleFilterKind[] = [],
  cardCollapsedIds: string[] = [],
  cardInteractionMode: "navigate" | "expand" = "expand",
  filterCombineMode: FilterCombineMode = "and",
): BoardSnapshotV1 {
  const co: Record<string, string> = {};
  for (const [k, v] of Object.entries(columnTitleOverrides)) {
    if (typeof v === "string" && v.trim()) co[String(k)] = v.trim();
  }
  const colors = parseFilterColors(filterColors);
  const schedule = parseScheduleFilterKinds(filterScheduleKinds);
  const combine = parseFilterCombineMode(filterCombineMode);
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    scope: "board",
    roots: roots.map(taskNodeToJson),
    pathIds: [...pathIds],
    collapsedIds: [...collapsedIds],
    cardCollapsedIds: [...cardCollapsedIds],
    ...(cardInteractionMode !== "expand" ? { cardInteractionMode } : {}),
    columnTitleOverrides: co,
    showFullTree: false,
    cardFieldVisibility: mergeCardFieldVisibility(cardFieldVisibility),
    ...(hideCompletedTasks ? { hideCompletedTasks: true } : {}),
    ...(filterTags.length ? { filterTags: [...filterTags] } : {}),
    ...(colors.length ? { filterColors: [...colors] } : {}),
    ...(schedule.length ? { filterScheduleKinds: [...schedule] } : {}),
    ...(combine !== "and" ? { filterCombineMode: combine } : {}),
    ...(normalizeCompletedTag(completedTag) !== DEFAULT_COMPLETED_TAG
      ? { completedTag: normalizeCompletedTag(completedTag) }
      : {}),
    ...(effortOnTasksEnabled ? {} : { effortOnTasksEnabled: false }),
    ...(clipboardRoots.length ? { clipboardRoots: clipboardRoots.map(taskNodeToJson) } : {}),
    ...(templates.length
      ? {
          templates: templates.map((t) => ({
            id: t.id,
            name: t.name,
            ...(t.description ? { description: t.description } : {}),
            updatedAt: t.updatedAt,
            root: t.root,
          })),
        }
      : {}),
  };
}

export function buildSubtreeSnapshot(node: TaskNode, meta?: { sourceNodeTitle?: string }): SubtreeSnapshotV1 {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    scope: "subtree",
    root: taskNodeToJson(node),
    sourceNodeId: node.id,
    ...(meta?.sourceNodeTitle ? { sourceNodeTitle: meta.sourceNodeTitle } : {}),
  };
}

export function downloadJsonFile(filename: string, jsonText: string): void {
  const blob = new Blob([jsonText], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Lädt das JSON-Schema der internen Speicher-/Exportstruktur als Datei herunter. */
export function downloadExportSchema(): void {
  downloadJsonFile(EXPORT_SCHEMA_FILENAME, `${JSON.stringify(EXPORT_SCHEMA_DOCUMENT, null, 2)}\n`);
}

export function downloadTextFile(filename: string, text: string, mimeType: string): void {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function boardSnapshotToColumnOverrides(doc: BoardSnapshotV1): Record<number, string> {
  return parseColumnTitleOverridesFromJson(doc.columnTitleOverrides);
}

/** Payload für `replaceBoardFromImport` aus einem Board-Export. */
export type BoardImportPayload = {
  roots: TaskNode[];
  pathIds: string[];
  collapsedIds?: string[];
  cardCollapsedIds?: string[];
  cardInteractionMode?: "navigate" | "expand";
  columnTitleOverrides: Record<number, string>;
  cardFieldVisibility?: CardFieldVisibility;
  hideCompletedTasks?: boolean;
  filterTags?: string[];
  filterColors?: CardColorId[];
  filterScheduleKinds?: ScheduleFilterKind[];
  filterCombineMode?: FilterCombineMode;
  completedTag?: string;
  effortOnTasksEnabled?: boolean;
  clipboardRoots?: TaskNode[];
  templates?: TemplateRecordV1[];
};

export function boardSnapshotToReplacePayload(snap: BoardSnapshotV1): BoardImportPayload {
  return {
    roots: snap.roots.map(taskNodeFromJson),
    pathIds: snap.pathIds,
    ...(snap.collapsedIds !== undefined ? { collapsedIds: [...snap.collapsedIds] } : {}),
    ...(snap.cardCollapsedIds !== undefined
      ? { cardCollapsedIds: [...snap.cardCollapsedIds] }
      : {}),
    ...(snap.cardInteractionMode === "navigate" || snap.cardInteractionMode === "expand"
      ? { cardInteractionMode: snap.cardInteractionMode }
      : {}),
    columnTitleOverrides: boardSnapshotToColumnOverrides(snap),
    cardFieldVisibility: snap.cardFieldVisibility,
    ...(snap.hideCompletedTasks === true ? { hideCompletedTasks: true } : {}),
    ...(snap.filterTags?.length ? { filterTags: [...snap.filterTags] } : {}),
    ...(snap.filterColors?.length ? { filterColors: [...snap.filterColors] } : {}),
    ...(snap.filterScheduleKinds?.length
      ? { filterScheduleKinds: [...snap.filterScheduleKinds] }
      : {}),
    ...(snap.filterCombineMode === "and" || snap.filterCombineMode === "or"
      ? { filterCombineMode: snap.filterCombineMode }
      : {}),
    ...(snap.completedTag ? { completedTag: normalizeCompletedTag(snap.completedTag) } : {}),
    ...(snap.effortOnTasksEnabled === false ? { effortOnTasksEnabled: false } : {}),
    ...(snap.clipboardRoots?.length
      ? { clipboardRoots: snap.clipboardRoots.map(taskNodeFromJson) }
      : {}),
    ...(snap.templates?.length ? { templates: [...snap.templates] } : {}),
  };
}

/** Stabiler Vergleichsschlüssel ohne `exportedAt` (vermeidet Fehlalarme beim Multi-Device-Polling). */
export function stableBoardStateKey(payload: BoardImportPayload): string {
  const co: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload.columnTitleOverrides)) {
    if (typeof v === "string" && v.trim()) co[String(k)] = v.trim();
  }
  const tags = payload.filterTags?.length
    ? [...payload.filterTags].map((t) => t.trim()).filter(Boolean).sort()
    : [];
  const colors = payload.filterColors?.length
    ? parseFilterColors(payload.filterColors).slice().sort()
    : [];
  const schedule = payload.filterScheduleKinds?.length
    ? parseScheduleFilterKinds(payload.filterScheduleKinds).slice().sort()
    : [];
  const templates = [...(payload.templates ?? [])]
    .map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description ?? "",
      updatedAt: t.updatedAt,
      root: t.root,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify({
    roots: payload.roots.map(taskNodeToJson),
    pathIds: [...payload.pathIds],
    collapsedIds: [...(payload.collapsedIds ?? [])].sort(),
    cardCollapsedIds: [...(payload.cardCollapsedIds ?? [])].sort(),
    cardInteractionMode: payload.cardInteractionMode === "navigate" ? "navigate" : "expand",
    columnTitleOverrides: co,
    cardFieldVisibility: mergeCardFieldVisibility(payload.cardFieldVisibility),
    hideCompletedTasks: payload.hideCompletedTasks === true,
    effortOnTasksEnabled: payload.effortOnTasksEnabled !== false,
    filterTags: tags,
    filterColors: colors,
    filterScheduleKinds: schedule,
    filterCombineMode: parseFilterCombineMode(payload.filterCombineMode),
    completedTag: normalizeCompletedTag(payload.completedTag ?? DEFAULT_COMPLETED_TAG),
    clipboardRoots: (payload.clipboardRoots ?? []).map(taskNodeToJson),
    templates,
  });
}

export function boardImportPayloadFromExportText(text: string): BoardImportPayload | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      roots: [],
      pathIds: [],
      columnTitleOverrides: {},
    };
  }
  try {
    const doc = parseExportedDocument(trimmed);
    if (!isBoardSnapshot(doc)) return null;
    return boardSnapshotToReplacePayload(doc);
  } catch {
    return null;
  }
}

export function stableBoardStateKeyFromExportText(text: string): string | null {
  const payload = boardImportPayloadFromExportText(text);
  if (!payload) return null;
  return stableBoardStateKey(payload);
}

export function boardExportTextsEquivalent(a: string, b: string): boolean {
  const ka = stableBoardStateKeyFromExportText(a);
  const kb = stableBoardStateKeyFromExportText(b);
  if (ka === null || kb === null) return a === b;
  return ka === kb;
}

export function isBoardSnapshot(doc: ExportedDocumentV1): doc is BoardSnapshotV1 {
  return doc.scope === "board";
}

export function isSubtreeSnapshot(doc: ExportedDocumentV1): doc is SubtreeSnapshotV1 {
  return doc.scope === "subtree";
}

/** Flache Liste aller Knoten für die Elternauswahl beim Teilbaum-Import. */
export function flattenNodesForParentSelect(roots: TaskNode[]): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  function walk(nodes: TaskNode[], depth: number) {
    for (const n of nodes) {
      const indent = "\u00a0\u00a0".repeat(depth);
      const labelTitle = n.title.trim() || "(Ohne Titel)";
      out.push({ id: n.id, label: `${indent}${labelTitle}` });
      walk(n.children, depth + 1);
    }
  }
  walk(roots, 0);
  return out;
}
