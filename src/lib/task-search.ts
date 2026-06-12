import type { TaskNode } from "@/types/task-node";

export type TaskSearchHit = {
  nodeId: string;
  title: string;
  /** Vorfahren-Titel ohne die Karte selbst, z. B. „Projekt › Phase 1“. */
  breadcrumb: string;
  score: number;
};

const DEFAULT_LIMIT = 25;

function normalizeSearchTerms(raw: string): string[] {
  return raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function buildHaystack(node: TaskNode): string {
  return [node.title, node.description, ...node.tags].join(" ").toLowerCase();
}

function scoreNode(node: TaskNode, terms: string[]): number {
  const title = node.title.toLowerCase();
  const desc = node.description.toLowerCase();
  const tags = node.tags.join(" ").toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (title.includes(term)) score += title.startsWith(term) ? 40 : 25;
    if (tags.includes(term)) score += 15;
    if (desc.includes(term)) score += 8;
  }
  return score;
}

function nodeMatchesAllTerms(node: TaskNode, terms: string[]): boolean {
  if (terms.length === 0) return false;
  const haystack = buildHaystack(node);
  return terms.every((t) => haystack.includes(t));
}

/**
 * Freitextsuche über Titel, Beschreibung und Tags (alle Suchwörter müssen vorkommen).
 */
export function searchTaskNodes(
  roots: TaskNode[],
  rawQuery: string,
  limit = DEFAULT_LIMIT,
): TaskSearchHit[] {
  const terms = normalizeSearchTerms(rawQuery);
  if (terms.length === 0) return [];

  const hits: TaskSearchHit[] = [];

  function walk(nodes: TaskNode[], ancestorTitles: string[]) {
    for (const node of nodes) {
      if (nodeMatchesAllTerms(node, terms)) {
        const title = node.title.trim() || "(Ohne Titel)";
        hits.push({
          nodeId: node.id,
          title,
          breadcrumb: ancestorTitles.join(" › "),
          score: scoreNode(node, terms),
        });
      }
      const nextAncestors = [...ancestorTitles, node.title.trim() || "(Ohne Titel)"];
      walk(node.children, nextAncestors);
    }
  }

  walk(roots, []);

  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "de"));
  return hits.slice(0, limit);
}
