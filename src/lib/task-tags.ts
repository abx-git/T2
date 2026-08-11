/**
 * Freie Tags pro Karte. Das konfigurierte „Erledigt“-Tag steuert Filter, KP, Fälligkeit u. a.
 */
export const DEFAULT_COMPLETED_TAG = "Erledigt";

/** @deprecated Alias — nutze `DEFAULT_COMPLETED_TAG`. */
export const DONE_TAG_DISPLAY = DEFAULT_COMPLETED_TAG;

/** Tag markiert eine Karte als Meilenstein (Groß-/Kleinschreibung egal). */
export const MILESTONE_TAG_DISPLAY = "Meilenstein";

export function normalizeTagLabel(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

export function normalizeCompletedTag(s: string): string {
  const n = normalizeTagLabel(s);
  return n || DEFAULT_COMPLETED_TAG;
}

export function uniqNonEmptyTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const n = normalizeTagLabel(raw);
    if (!n) continue;
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

export function isTaskMarkedDone(
  node: { tags: string[] },
  completedTag: string = DEFAULT_COMPLETED_TAG,
): boolean {
  const t = normalizeCompletedTag(completedTag).toLowerCase();
  return node.tags.some((x) => normalizeTagLabel(x).toLowerCase() === t);
}

function isCompletedTagLabel(label: string, completedTag: string): boolean {
  return normalizeTagLabel(label).toLowerCase() === normalizeCompletedTag(completedTag).toLowerCase();
}

/** Tags ohne das konfigurierte Erledigt-Tag (für Tag-Liste im Editor). */
export function tagsWithoutCompletedTag(
  tags: string[],
  completedTag: string = DEFAULT_COMPLETED_TAG,
): string[] {
  return tags.filter((t) => !isCompletedTagLabel(t, completedTag));
}

/** Erledigt-Tag setzen oder entfernen; Schreibweise = konfigurierter `completedTag`. */
export function setCompletedTagOnTags(
  tags: string[],
  completedTag: string,
  done: boolean,
): string[] {
  const canonical = normalizeCompletedTag(completedTag);
  const rest = tagsWithoutCompletedTag(tags, completedTag);
  return done ? uniqNonEmptyTags([...rest, canonical]) : rest;
}

export function isTaskMilestone(node: { tags: string[] }): boolean {
  const t = MILESTONE_TAG_DISPLAY.toLowerCase();
  return node.tags.some((x) => normalizeTagLabel(x).toLowerCase() === t);
}

export function tagKey(s: string): string {
  return normalizeTagLabel(s).toLowerCase();
}

/** Alle im Wald vorkommenden Tags (kanonische Schreibweise, sortiert). */
export function collectAllTagsFromForest(roots: { tags: string[]; children: unknown[] }[]): string[] {
  const byKey = new Map<string, string>();
  function walk(nodes: { tags: string[]; children: unknown[] }[]) {
    for (const n of nodes) {
      for (const raw of n.tags) {
        const label = normalizeTagLabel(raw);
        if (!label) continue;
        const k = tagKey(label);
        if (!byKey.has(k)) byKey.set(k, label);
      }
      walk(n.children as { tags: string[]; children: unknown[] }[]);
    }
  }
  walk(roots);
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, "de"));
}

/** Filter-Chips: Tags ohne aktiven Include-/Exclude-Zustand. */
export function tagsAvailableForFilter(
  allTags: string[],
  selectedTags: string[],
  excludeTags: string[] = [],
): string[] {
  const selected = new Set([...selectedTags, ...excludeTags].map(tagKey));
  return allTags.filter((t) => !selected.has(tagKey(t)));
}

export function nodeHasAnyFilterTag(node: { tags: string[] }, filterTags: string[]): boolean {
  if (!filterTags.length) return true;
  const keys = new Set(filterTags.map(tagKey));
  return node.tags.some((t) => keys.has(tagKey(t)));
}

/** Aktive Include-Tag-Filter auf neu angelegte Karten übernehmen. */
export function defaultTagsForNewCard(filterTags: readonly string[]): string[] {
  return filterTags.length ? [...filterTags] : [];
}

export type FilterTagState = "neutral" | "include" | "exclude";

export function filterTagState(
  tag: string,
  includeTags: readonly string[],
  excludeTags: readonly string[],
): FilterTagState {
  const k = tagKey(tag);
  if (includeTags.some((t) => tagKey(t) === k)) return "include";
  if (excludeTags.some((t) => tagKey(t) === k)) return "exclude";
  return "neutral";
}

export function nextFilterTagState(current: FilterTagState): FilterTagState {
  if (current === "neutral") return "include";
  if (current === "include") return "exclude";
  return "neutral";
}

/** Alle Tags für die Filterleiste (Board + aktive Filterzustände), sortiert. */
export function tagsForFilterBar(
  allTags: string[],
  includeTags: string[],
  excludeTags: string[],
): string[] {
  const byKey = new Map<string, string>();
  for (const t of [...allTags, ...includeTags, ...excludeTags]) {
    const label = normalizeTagLabel(t);
    if (!label) continue;
    const k = tagKey(label);
    if (!byKey.has(k)) byKey.set(k, label);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/** Nur für JSON-Import älterer Dateien mit `status`. */
export function tagsFromLegacyStatus(
  status: string | undefined,
  completedTag: string = DEFAULT_COMPLETED_TAG,
): string[] {
  if (status === "done") return [normalizeCompletedTag(completedTag)];
  if (status === "in-progress") return ["In Arbeit"];
  return [];
}

/** Anzahl Karten im Wald, die ein Tag tragen (case-insensitiv). */
export function countTagUsagesInForest(
  roots: { tags: string[]; children: unknown[] }[],
  label: string,
): number {
  const k = tagKey(label);
  let count = 0;
  function walk(nodes: { tags: string[]; children: unknown[] }[]) {
    for (const n of nodes) {
      if (n.tags.some((t) => tagKey(t) === k)) count++;
      walk(n.children as { tags: string[]; children: unknown[] }[]);
    }
  }
  walk(roots);
  return count;
}

/** Ersetzt ein Tag überall im Wald (case-insensitiv); Schreibweise = `newLabel`. */
export function renameTagInForest<T extends { tags: string[]; children: T[] }>(
  roots: T[],
  oldLabel: string,
  newLabel: string,
): T[] {
  const oldKey = tagKey(oldLabel);
  const newCanonical = normalizeTagLabel(newLabel);
  if (!newCanonical) return roots;

  function renameTags(tags: string[]): string[] {
    return uniqNonEmptyTags(tags.map((t) => (tagKey(t) === oldKey ? newCanonical : t)));
  }

  function mapNode(node: T): T {
    return {
      ...node,
      tags: renameTags(node.tags),
      children: node.children.map(mapNode),
    };
  }

  return roots.map(mapNode);
}

/** Tailwind-Klassen für Tag-Chips (Karten, Filter, Editor). Kleiner als Kartentitel (`text-sm`). */
export function tagChipClass(
  tag: string,
  completedTag: string = DEFAULT_COMPLETED_TAG,
): string {
  const base =
    "inline-flex max-w-full items-center truncate rounded border px-1.5 py-px text-[10px] font-medium leading-tight";
  const k = normalizeTagLabel(tag).toLowerCase();
  if (k === normalizeCompletedTag(completedTag).toLowerCase()) {
    return `${base} border-emerald-400/90 bg-emerald-50 text-emerald-800`;
  }
  if (k === MILESTONE_TAG_DISPLAY.toLowerCase()) {
    return `${base} border-amber-400/90 bg-amber-50 text-amber-900`;
  }
  return `${base} border-slate-300 bg-slate-50 text-slate-700`;
}
