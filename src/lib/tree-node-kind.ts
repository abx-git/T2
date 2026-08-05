import type { TaskNode } from "@/types/task-node";

export type TreeNodeKind = "card" | "note";

export function getNodeKind(node: Pick<TaskNode, "kind">): TreeNodeKind {
  return node.kind === "note" ? "note" : "card";
}

export function isNoteNode(node: Pick<TaskNode, "kind">): boolean {
  return getNodeKind(node) === "note";
}

export function isCardNode(node: Pick<TaskNode, "kind">): boolean {
  return !isNoteNode(node);
}

export function normalizeNoteMarkdown(raw: string): string {
  return raw.replace(/\r\n/g, "\n");
}

export function noteMarkdownPreview(markdown: string | undefined, maxLen = 120): string {
  const oneLine = normalizeNoteMarkdown(markdown ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!oneLine) return "";
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen)}…`;
}

/** Anzeigetitel in Liste, Outline und Suche. */
export function nodeDisplayTitle(node: TaskNode): string {
  const title = node.title.trim();
  if (title) return title;
  if (isNoteNode(node)) {
    const first = normalizeNoteMarkdown(node.markdown ?? "")
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean);
    return first || "Notiz";
  }
  return "(Ohne Titel)";
}

export function createBlankCardNode(
  id: string,
  extras?: Partial<Pick<TaskNode, "tags" | "cardColor">>,
): TaskNode {
  return {
    id,
    kind: "card",
    title: "",
    link: "",
    command: "",
    description: "",
    tags: extras?.tags ?? [],
    dueDate: null,
    reminderDate: null,
    effort: 0,
    effortUnit: "hours",
    effortSource: "manual",
    ...(extras?.cardColor ? { cardColor: extras.cardColor } : {}),
    children: [],
  };
}

export function createBlankNoteNode(id: string): TaskNode {
  return {
    id,
    kind: "note",
    title: "",
    markdown: "",
    link: "",
    command: "",
    description: "",
    tags: [],
    dueDate: null,
    reminderDate: null,
    effort: 0,
    children: [],
  };
}
