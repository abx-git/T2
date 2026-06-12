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

/** Filter-Chips: alle Tags außer bereits gewählte (case-insensitiv). */
export function tagsAvailableForFilter(allTags: string[], selectedTags: string[]): string[] {
  const selected = new Set(selectedTags.map(tagKey));
  return allTags.filter((t) => !selected.has(tagKey(t)));
}

export function nodeHasAnyFilterTag(node: { tags: string[] }, filterTags: string[]): boolean {
  if (!filterTags.length) return true;
  const keys = new Set(filterTags.map(tagKey));
  return node.tags.some((t) => keys.has(tagKey(t)));
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

/** Tailwind-Klassen für Tag-Chips auf Karten. */
export function tagChipClass(
  tag: string,
  completedTag: string = DEFAULT_COMPLETED_TAG,
): string {
  const k = normalizeTagLabel(tag).toLowerCase();
  if (k === normalizeCompletedTag(completedTag).toLowerCase()) {
    return "bg-emerald-100 text-emerald-800 ring-emerald-200/80";
  }
  if (k === MILESTONE_TAG_DISPLAY.toLowerCase()) {
    return "bg-amber-100 text-amber-900 ring-amber-200/80";
  }
  return "bg-slate-100 text-slate-700 ring-slate-200/80";
}
