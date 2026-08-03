/**
 * Flache Trefferliste für aktive Board-Filter (Tags / Farben / Termine).
 */

import { formatDueHint, isDueOverdue } from "@/lib/aggregates";
import {
  cardColorLabel,
  nodeMatchesBoardFilters,
  SCHEDULE_FILTER_LABELS,
  type FilterCombineMode,
  type ScheduleFilterKind,
} from "@/lib/board-filters";
import type { CardColorId } from "@/lib/card-color";
import { isTaskMarkedDone } from "@/lib/task-tags";
import type { TaskNode } from "@/types/task-node";

export type FilterResultsMarkdownStyle = "plain" | "checklist";

export interface FilterResultCard {
  nodeId: string;
  title: string;
  pathTitles: string[];
  tags: string[];
  cardColor?: CardColorId;
  dueDate: Date | null;
  reminderDate: Date | null;
  done: boolean;
  overdue: boolean;
}

export interface CollectFilterResultsOptions {
  filterTags: string[];
  filterColors: CardColorId[];
  filterScheduleKinds: ScheduleFilterKind[];
  filterCombineMode?: FilterCombineMode;
  completedTag: string;
  /** Erledigte Treffer einbeziehen (Standard: ja). */
  includeDone?: boolean;
}

export interface FormatFilterResultsOptions extends CollectFilterResultsOptions {
  style: FilterResultsMarkdownStyle;
}

function displayTitle(title: string): string {
  const t = title.trim();
  return t || "(Ohne Titel)";
}

function pathLabel(pathTitles: string[]): string {
  if (!pathTitles.length) return "";
  return pathTitles.map((t) => displayTitle(t)).join(" › ");
}

function nextRelevantDate(card: FilterResultCard): number {
  const times: number[] = [];
  if (card.dueDate) times.push(card.dueDate.getTime());
  if (card.reminderDate) times.push(card.reminderDate.getTime());
  if (!times.length) return Number.POSITIVE_INFINITY;
  return Math.min(...times);
}

/** Aktive Facettenfilter gesetzt? */
export function hasActiveFacetFilters(opts: {
  filterTags: string[];
  filterColors: CardColorId[];
  filterScheduleKinds: ScheduleFilterKind[];
}): boolean {
  return (
    opts.filterTags.length > 0 ||
    opts.filterColors.length > 0 ||
    opts.filterScheduleKinds.length > 0
  );
}

/**
 * Alle Karten, die die Board-Filter erfüllen (flach).
 * Sortierung: überfällig zuerst, dann nächster Termin, sonst Titel.
 */
export function collectFilterMatchingCards(
  roots: TaskNode[],
  options: CollectFilterResultsOptions,
): FilterResultCard[] {
  const includeDone = options.includeDone !== false;
  const filterOpts = {
    filterTags: options.filterTags,
    filterColors: options.filterColors,
    filterScheduleKinds: options.filterScheduleKinds,
    filterCombineMode: options.filterCombineMode,
  };
  const cards: FilterResultCard[] = [];

  function walk(nodes: TaskNode[], ancestors: string[]) {
    for (const node of nodes) {
      const title = displayTitle(node.title);
      const pathTitles = [...ancestors, title];
      const done = isTaskMarkedDone(node, options.completedTag);

      if (nodeMatchesBoardFilters(node, filterOpts) && (includeDone || !done)) {
        cards.push({
          nodeId: node.id,
          title,
          pathTitles,
          tags: [...node.tags],
          cardColor: node.cardColor,
          dueDate: node.dueDate,
          reminderDate: node.reminderDate,
          done,
          overdue: isDueOverdue(node.dueDate, done),
        });
      }

      walk(node.children, pathTitles);
    }
  }

  walk(roots, []);

  cards.sort((a, b) => {
    const aOver = a.overdue && !a.done ? 0 : 1;
    const bOver = b.overdue && !b.done ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;
    const aDate = nextRelevantDate(a);
    const bDate = nextRelevantDate(b);
    if (aDate !== bDate) return aDate - bDate;
    return a.title.localeCompare(b.title, "de");
  });

  return cards;
}

function formatPlainCardLine(card: FilterResultCard): string {
  const parts = [`**${card.title}**`];
  const path = pathLabel(card.pathTitles);
  if (path) parts.push(`\`${path}\``);
  if (card.cardColor) parts.push(cardColorLabel(card.cardColor));
  if (card.tags.length) parts.push(card.tags.map((t) => `#${t}`).join(" "));
  if (card.dueDate) {
    const d = formatDueHint(card.dueDate);
    if (d) parts.push(`Fällig ${d}`);
  }
  if (card.reminderDate) {
    const d = formatDueHint(card.reminderDate);
    if (d) parts.push(`Erinnerung ${d}`);
  }
  if (card.done) parts.push("*(erledigt)*");
  else if (card.overdue) parts.push("*(überfällig)*");
  return `- ${parts.join(" · ")}`;
}

function formatChecklistCardLine(card: FilterResultCard): string {
  const checkbox = card.done ? "[x]" : "[ ]";
  const path = pathLabel(card.pathTitles);
  const pathSuffix = path ? ` — \`${path}\`` : "";
  const bits: string[] = [];
  if (card.dueDate) {
    const d = formatDueHint(card.dueDate);
    if (d) bits.push(`📅 ${d}`);
  }
  if (card.reminderDate) {
    const d = formatDueHint(card.reminderDate);
    if (d) bits.push(`⏳ ${d}`);
  }
  if (card.overdue && !card.done) bits.push("⚠️");
  const meta = bits.length ? ` ${bits.join(" ")}` : "";
  return `- ${checkbox} ${card.title}${pathSuffix}${meta}`;
}

function filterSummaryLine(options: CollectFilterResultsOptions): string {
  const bits: string[] = [];
  if (options.filterTags.length) bits.push(`Tags: ${options.filterTags.join(", ")}`);
  if (options.filterColors.length) {
    bits.push(`Farben: ${options.filterColors.map(cardColorLabel).join(", ")}`);
  }
  if (options.filterScheduleKinds.length) {
    bits.push(
      `Termine: ${options.filterScheduleKinds.map((k) => SCHEDULE_FILTER_LABELS[k]).join(", ")}`,
    );
  }
  const join = (options.filterCombineMode ?? "and") === "or" ? "ODER" : "UND";
  return bits.length ? `${bits.join(` ${join} `)}` : "Filter";
}

/** Markdown-Liste der Filter-Treffer. */
export function formatFilterResultsMarkdown(
  roots: TaskNode[],
  options: FormatFilterResultsOptions,
): string {
  const cards = collectFilterMatchingCards(roots, options);
  const lines: string[] = ["# Treffer", ""];
  lines.push(`*Filter: ${filterSummaryLine(options)}*`, "");

  if (!cards.length) {
    lines.push("*(Keine Karten passen zum aktuellen Filter.)*");
    lines.push("");
    return lines.join("\n");
  }

  const open = cards.filter((c) => !c.done).length;
  lines.push(
    `*${cards.length} Karten${open < cards.length ? ` (${open} offen)` : ""}*`,
    "",
  );

  for (const card of cards) {
    lines.push(
      options.style === "checklist" ? formatChecklistCardLine(card) : formatPlainCardLine(card),
    );
  }

  lines.push("");
  return lines.join("\n");
}
