import {
  CARD_COLOR_IDS,
  CARD_COLOR_OPTIONS,
  type CardColorId,
} from "@/lib/card-color";
import { tagKey } from "@/lib/task-tags";
import { isNoteNode } from "@/lib/tree-node-kind";
import type { TaskNode } from "@/types/task-node";

/** Wie aktive Filterkriterien verknüpft werden. */
export const FILTER_COMBINE_MODES = ["and", "or"] as const;
export type FilterCombineMode = (typeof FILTER_COMBINE_MODES)[number];

export function isFilterCombineMode(raw: unknown): raw is FilterCombineMode {
  return raw === "and" || raw === "or";
}

export function parseFilterCombineMode(raw: unknown): FilterCombineMode {
  return isFilterCombineMode(raw) ? raw : "and";
}

/** Filter nach Terminart. */
export const SCHEDULE_FILTER_KINDS = ["due", "reminder"] as const;
export type ScheduleFilterKind = (typeof SCHEDULE_FILTER_KINDS)[number];

export const SCHEDULE_FILTER_LABELS: Record<ScheduleFilterKind, string> = {
  due: "Fällig",
  reminder: "Erinnerung",
};

export function isScheduleFilterKind(raw: unknown): raw is ScheduleFilterKind {
  return typeof raw === "string" && (SCHEDULE_FILTER_KINDS as readonly string[]).includes(raw);
}

export function parseScheduleFilterKinds(raw: unknown): ScheduleFilterKind[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<ScheduleFilterKind>();
  const out: ScheduleFilterKind[] = [];
  for (const x of raw) {
    if (!isScheduleFilterKind(x) || seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

export function parseFilterColors(raw: unknown): CardColorId[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<CardColorId>();
  const out: CardColorId[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    if (!(CARD_COLOR_IDS as readonly string[]).includes(x)) continue;
    const id = x as CardColorId;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Farben, die irgendwo im Wald vorkommen (Palette-Reihenfolge). */
export function collectColorsFromForest(
  roots: { cardColor?: CardColorId; children: unknown[] }[],
): CardColorId[] {
  const found = new Set<CardColorId>();
  function walk(nodes: { cardColor?: CardColorId; children: unknown[] }[]) {
    for (const n of nodes) {
      if (n.cardColor) found.add(n.cardColor);
      walk(n.children as { cardColor?: CardColorId; children: unknown[] }[]);
    }
  }
  walk(roots);
  return CARD_COLOR_IDS.filter((id) => found.has(id));
}

export function colorsAvailableForFilter(
  allColors: CardColorId[],
  selected: CardColorId[],
): CardColorId[] {
  const selectedSet = new Set(selected);
  return allColors.filter((c) => !selectedSet.has(c));
}

export function cardColorLabel(id: CardColorId): string {
  return CARD_COLOR_OPTIONS.find((o) => o.id === id)?.label ?? id;
}

export function cardColorSwatchClass(id: CardColorId): string {
  return CARD_COLOR_OPTIONS.find((o) => o.id === id)?.swatchClass ?? "bg-slate-400";
}

/** Welche Terminarten im Wald vorkommen. */
export function collectScheduleKindsFromForest(
  roots: { dueDate: Date | null; reminderDate: Date | null; children: unknown[] }[],
): ScheduleFilterKind[] {
  let hasDue = false;
  let hasReminder = false;
  function walk(
    nodes: { dueDate: Date | null; reminderDate: Date | null; children: unknown[] }[],
  ) {
    for (const n of nodes) {
      if (n.dueDate) hasDue = true;
      if (n.reminderDate) hasReminder = true;
      if (hasDue && hasReminder) return;
      walk(n.children as typeof nodes);
    }
  }
  walk(roots);
  const out: ScheduleFilterKind[] = [];
  if (hasDue) out.push("due");
  if (hasReminder) out.push("reminder");
  return out;
}

export function scheduleKindsAvailableForFilter(
  allKinds: ScheduleFilterKind[],
  selected: ScheduleFilterKind[],
): ScheduleFilterKind[] {
  const selectedSet = new Set(selected);
  return allKinds.filter((k) => !selectedSet.has(k));
}

export function nodeHasAnyFilterColor(
  node: { cardColor?: CardColorId },
  filterColors: CardColorId[],
): boolean {
  if (!filterColors.length) return true;
  return node.cardColor != null && filterColors.includes(node.cardColor);
}

export function nodeMatchesAnyScheduleFilter(
  node: { dueDate: Date | null; reminderDate: Date | null },
  filterScheduleKinds: ScheduleFilterKind[],
): boolean {
  if (!filterScheduleKinds.length) return true;
  for (const kind of filterScheduleKinds) {
    if (kind === "due" && node.dueDate) return true;
    if (kind === "reminder" && node.reminderDate) return true;
  }
  return false;
}

/** Aktive Farbfilter: bei genau einer Farbe auf neue Karten übernehmen. */
export function defaultColorForNewCard(
  filterColors: readonly CardColorId[],
): CardColorId | undefined {
  return filterColors.length === 1 ? filterColors[0] : undefined;
}

/**
 * Einzelne Filterkriterien als booleans (jedes Tag, jede Farbe, jede Terminart).
 * Leer = keine Einschränkung.
 */
export function boardFilterCriteriaMatches(
  node: Pick<TaskNode, "tags" | "dueDate" | "reminderDate" | "cardColor">,
  opts: {
    filterTags: string[];
    filterColors: CardColorId[];
    filterScheduleKinds: ScheduleFilterKind[];
  },
): boolean[] {
  const matches: boolean[] = [];
  for (const tag of opts.filterTags) {
    const key = tagKey(tag);
    matches.push(node.tags.some((t) => tagKey(t) === key));
  }
  for (const color of opts.filterColors) {
    matches.push(node.cardColor === color);
  }
  for (const kind of opts.filterScheduleKinds) {
    if (kind === "due") matches.push(node.dueDate != null);
    else if (kind === "reminder") matches.push(node.reminderDate != null);
  }
  return matches;
}

/**
 * Karte passt zu den aktiven Filterkriterien.
 * Notizen haben keine Filter-Facetten — sie matchen nie selbst
 * (Sichtbarkeit steuert `rootsForMindmapDisplay` über die Elternkarte).
 * `and` = alle Kriterien müssen erfüllt sein;
 * `or` = mindestens ein Kriterium reicht.
 */
export function nodeMatchesBoardFilters(
  node: Pick<TaskNode, "kind" | "tags" | "dueDate" | "reminderDate" | "cardColor">,
  opts: {
    filterTags: string[];
    filterColors: CardColorId[];
    filterScheduleKinds: ScheduleFilterKind[];
    filterCombineMode?: FilterCombineMode;
  },
): boolean {
  if (isNoteNode(node)) return false;
  const matches = boardFilterCriteriaMatches(node, opts);
  if (matches.length === 0) return true;
  const mode = opts.filterCombineMode ?? "and";
  return mode === "or" ? matches.some(Boolean) : matches.every(Boolean);
}
