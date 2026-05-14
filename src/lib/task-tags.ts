/**
 * Freie Tags pro Karte. „Erledigt“-Filter und Erscheinungsbild nutzen dasselbe
 * Schwellen-Tag (Groß-/Kleinschreibung egal).
 */
export const DONE_TAG_DISPLAY = "Erledigt";

export function normalizeTagLabel(s: string): string {
  return s.trim().replace(/\s+/g, " ");
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

export function isTaskMarkedDone(node: { tags: string[] }): boolean {
  const t = DONE_TAG_DISPLAY.toLowerCase();
  return node.tags.some((x) => normalizeTagLabel(x).toLowerCase() === t);
}

/** Nur für JSON-Import älterer Dateien mit `status`. */
export function tagsFromLegacyStatus(status: string | undefined): string[] {
  if (status === "done") return [DONE_TAG_DISPLAY];
  if (status === "in-progress") return ["In Arbeit"];
  return [];
}

/** Tailwind-Klassen für Tag-Chips auf Karten. */
export function tagChipClass(tag: string): string {
  if (normalizeTagLabel(tag).toLowerCase() === DONE_TAG_DISPLAY.toLowerCase()) {
    return "bg-emerald-100 text-emerald-800 ring-emerald-200/80";
  }
  return "bg-slate-100 text-slate-700 ring-slate-200/80";
}
