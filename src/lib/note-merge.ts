/**
 * Karte ↔ Notiz: Umwandeln und Markdown beim Drop auf eine Notiz zusammenführen.
 */

import { isNoteNode, normalizeNoteMarkdown } from "@/lib/tree-node-kind";
import {
  detachNodeById,
  findNodeById,
  subtreeContainsId,
} from "@/lib/tree-utils";
import type { TaskNode } from "@/types/task-node";

/** Körper einer Karte/Notiz als Markdown-Block (ohne äußeren Titel). */
export function nodeBodyAsMarkdown(node: TaskNode): string {
  if (isNoteNode(node)) {
    return normalizeNoteMarkdown(node.markdown ?? "").trim();
  }
  return (node.description ?? "").replace(/\r\n/g, "\n").trim();
}

/** Markdown-Beitrag einer Quelle inkl. Titel-Überschrift, falls sinnvoll. */
export function sourceContributionMarkdown(source: TaskNode): string {
  const title = source.title.trim();
  const body = nodeBodyAsMarkdown(source);
  if (title && body) return `## ${title}\n\n${body}`;
  if (title) return `## ${title}`;
  return body;
}

export function appendMarkdownBlocks(existing: string, incoming: string): string {
  const a = normalizeNoteMarkdown(existing).trimEnd();
  const b = normalizeNoteMarkdown(incoming).trim();
  if (!b) return normalizeNoteMarkdown(existing);
  if (!a.trim()) return `${b}\n`;
  return `${a}\n\n${b}\n`;
}

/** Karte → Notiz (gleiche ID/Kinder); Beschreibung wird Markdown. */
export function convertCardNodeToNote(node: TaskNode): TaskNode {
  if (isNoteNode(node)) return node;
  const markdown = nodeBodyAsMarkdown(node);
  return {
    id: node.id,
    kind: "note",
    title: node.title,
    markdown: markdown ? `${markdown}\n` : "",
    link: "",
    command: "",
    description: "",
    tags: [],
    dueDate: null,
    reminderDate: null,
    effort: 0,
    children: node.children,
  };
}

export function convertCardToNoteInForest(roots: TaskNode[], nodeId: string): TaskNode[] {
  let found = false;
  function mapNodes(nodes: TaskNode[]): TaskNode[] {
    return nodes.map((n) => {
      if (n.id === nodeId) {
        found = true;
        if (isNoteNode(n)) return n;
        return convertCardNodeToNote(n);
      }
      if (n.children.length === 0) return n;
      return { ...n, children: mapNodes(n.children) };
    });
  }
  const next = mapNodes(roots);
  return found ? next : roots;
}

/**
 * Quelle in Ziel-Notiz mergen: Markdown anhängen, Quell-Kinder übernehmen, Quelle entfernen.
 * `null` = Ziel ist keine Notiz (Caller soll nesten).
 * Unveränderte `roots` = ungültiger Drop.
 */
export function applyMergeIntoNote(
  roots: TaskNode[],
  sourceId: string,
  targetNoteId: string,
): TaskNode[] | null {
  const target = findNodeById(roots, targetNoteId);
  if (!target || !isNoteNode(target)) return null;

  const source = findNodeById(roots, sourceId);
  if (!source) return roots;
  if (sourceId === targetNoteId || subtreeContainsId(source, targetNoteId)) return roots;

  const contribution = sourceContributionMarkdown(source);
  const nextMarkdown = appendMarkdownBlocks(target.markdown ?? "", contribution);
  const absorbedChildren = source.children.map((c) => structuredClone(c) as TaskNode);

  const { next: withoutSource, detached } = detachNodeById(roots, sourceId);
  if (!detached) return roots;

  let replaced = false;
  function mapNodes(nodes: TaskNode[]): TaskNode[] {
    return nodes.map((n) => {
      if (n.id === targetNoteId) {
        replaced = true;
        return {
          ...n,
          kind: "note" as const,
          markdown: nextMarkdown,
          children: [...n.children, ...absorbedChildren],
        };
      }
      if (n.children.length === 0) return n;
      return { ...n, children: mapNodes(n.children) };
    });
  }
  const next = mapNodes(withoutSource);
  return replaced ? next : roots;
}

/**
 * Externen Knoten (z. B. Zwischenablage) in eine Notiz mergen.
 * `null` = Ziel ist keine Notiz.
 */
export function mergeExternalNodeIntoNote(
  roots: TaskNode[],
  insert: TaskNode,
  targetNoteId: string,
): TaskNode[] | null {
  const target = findNodeById(roots, targetNoteId);
  if (!target || !isNoteNode(target)) return null;
  if (insert.id === targetNoteId || subtreeContainsId(insert, targetNoteId)) return roots;

  const contribution = sourceContributionMarkdown(insert);
  const nextMarkdown = appendMarkdownBlocks(target.markdown ?? "", contribution);
  const absorbedChildren = (insert.children ?? []).map((c) => structuredClone(c) as TaskNode);

  let replaced = false;
  function mapNodes(nodes: TaskNode[]): TaskNode[] {
    return nodes.map((n) => {
      if (n.id === targetNoteId) {
        replaced = true;
        return {
          ...n,
          kind: "note" as const,
          markdown: nextMarkdown,
          children: [...n.children, ...absorbedChildren],
        };
      }
      if (n.children.length === 0) return n;
      return { ...n, children: mapNodes(n.children) };
    });
  }
  const next = mapNodes(roots);
  return replaced ? next : roots;
}
