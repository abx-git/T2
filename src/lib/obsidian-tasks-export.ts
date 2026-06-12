import { isDateOnlyDue } from "@/lib/task-datetime";
import { formatEffortValue, getEffortUnit } from "@/lib/task-effort";
import { taskLinkHref } from "@/lib/task-link";
import { isTaskMarkedDone } from "@/lib/task-tags";
import type { TaskNode } from "@/types/task-node";

/** Obsidian Tasks: 📅 Fällig, ⏳ Geplant/Erinnerung, ✅ Erledigt am. */
const EMOJI_DUE = "📅";
const EMOJI_SCHEDULED = "⏳";
const EMOJI_DONE = "✅";

export interface ObsidianTasksExportOptions {
  /** Tag, der eine Karte als erledigt markiert (Checkbox `[x]`). */
  completedTag: string;
  /** Aufwand an die Zeile anhängen (z. B. `2h`). */
  effortOnTasksEnabled?: boolean;
  /** Beschreibung als Blockzitat unter der Aufgabe. */
  includeDescription?: boolean;
}

/** ISO-Datum bzw. Datum+Uhrzeit für Obsidian Tasks. */
export function formatObsidianTasksDate(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  if (isDateOnlyDue(d)) return `${y}-${mo}-${day}`;
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day} ${h}:${min}`;
}

/** Tag als Obsidian-Hashtag (`#Meilenstein`). */
export function tagToObsidianHashtag(tag: string): string {
  const inner = tag
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_\-]/gu, "");
  return inner ? `#${inner}` : "";
}

function escapeTaskTitle(title: string): string {
  return title.replace(/\r?\n/g, " ").trim();
}

function escapeMarkdownLinkText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

/** Titel als Markdown-Link, wenn `link` gesetzt ist. */
export function formatObsidianTaskTitle(node: Pick<TaskNode, "title" | "link">): string {
  const label = escapeTaskTitle(node.title) || "(Ohne Titel)";
  const href = taskLinkHref(node.link);
  if (!href) return label;
  return `[${escapeMarkdownLinkText(label)}](${href})`;
}

function appendDescriptionLines(
  lines: string[],
  description: string,
  listIndent: string,
): void {
  const trimmed = description.trim();
  if (!trimmed) return;
  const quotePrefix = `${listIndent}> `;
  for (const part of trimmed.split(/\r?\n/)) {
    lines.push(`${quotePrefix}${part}`);
  }
}

function formatTaskLine(node: TaskNode, depth: number, options: ObsidianTasksExportOptions): string {
  const indent = depth > 0 ? "\t".repeat(depth) : "";
  const done = isTaskMarkedDone(node, options.completedTag);
  const checkbox = done ? "[x]" : "[ ]";
  const title = formatObsidianTaskTitle(node);

  const parts: string[] = [`${indent}- ${checkbox} ${title}`];

  for (const tag of node.tags) {
    const ht = tagToObsidianHashtag(tag);
    if (ht) parts.push(ht);
  }

  if (node.reminderDate) {
    parts.push(`${EMOJI_SCHEDULED} ${formatObsidianTasksDate(node.reminderDate)}`);
  }
  if (node.dueDate) {
    if (done) {
      parts.push(`${EMOJI_DONE} ${formatObsidianTasksDate(node.dueDate)}`);
    } else {
      parts.push(`${EMOJI_DUE} ${formatObsidianTasksDate(node.dueDate)}`);
    }
  }

  if (options.effortOnTasksEnabled !== false && node.effort > 0) {
    const effortStr = formatEffortValue(node.effort, getEffortUnit(node));
    if (effortStr) parts.push(`⏱️ ${effortStr}`);
  }

  return parts.join(" ");
}

function walkNode(
  lines: string[],
  node: TaskNode,
  depth: number,
  options: ObsidianTasksExportOptions,
): void {
  const listIndent = depth > 0 ? "\t".repeat(depth) : "";
  lines.push(formatTaskLine(node, depth, options));

  if (options.includeDescription !== false && node.description.trim()) {
    appendDescriptionLines(lines, node.description, listIndent);
  }

  for (const child of node.children) {
    walkNode(lines, child, depth + 1, options);
  }
}

/** Gesamten Teilbaum als Markdown mit Obsidian-Tasks-Zeilen (Einrückung = Ebene). */
export function taskSubtreeToObsidianTasksMarkdown(
  root: TaskNode,
  options: ObsidianTasksExportOptions,
): string {
  const lines: string[] = [
    "<!-- Hierarchical Task Manager — Obsidian Tasks export -->",
    "",
  ];
  walkNode(lines, root, 0, options);
  return `${lines.join("\n").trimEnd()}\n`;
}
