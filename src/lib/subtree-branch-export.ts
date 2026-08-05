import { slugForBackupFilename } from "@/lib/board-backup";
import {
  appendMarkdownDescriptionLines,
  formatObsidianTasksDate,
  formatObsidianTaskTitle,
} from "@/lib/obsidian-tasks-export";
import { formatEffortValue, getEffortUnit } from "@/lib/task-effort";
import { formatTaskIdForDisplay } from "@/lib/task-id";
import { getTaskCommand } from "@/lib/task-command";
import { taskLinkHref } from "@/lib/task-link";
import { isTaskMarkedDone } from "@/lib/task-tags";
import {
  buildSubtreeSnapshot,
  stringifyExportedDocument,
  type SubtreeSnapshotV1,
} from "@/lib/task-tree-json";
import type { TaskNode } from "@/types/task-node";

/** Exportierbare Felder pro Karte (Titel steuert Überschriften / JSON-Struktur). */
export const SUBTREE_EXPORT_ATTRIBUTE_KEYS = [
  "title",
  "link",
  "command",
  "description",
  "tags",
  "dueDate",
  "reminderDate",
  "effort",
  "id",
  "completed",
] as const;

export type SubtreeExportAttributeKey = (typeof SUBTREE_EXPORT_ATTRIBUTE_KEYS)[number];
export type SubtreeExportAttributes = Record<SubtreeExportAttributeKey, boolean>;

export type BranchExportFormat = "markdown" | "json";

/** Nur die Wurzelkarte, oder die Karte inkl. aller Nachfahren. */
export type BranchExportScope = "card" | "subtree";

export interface SubtreeBranchExportOptions {
  format: BranchExportFormat;
  attributes: SubtreeExportAttributes;
  completedTag: string;
  effortOnTasksEnabled?: boolean;
  /** JSON: vollständiger Teilbaum-Import (scope subtree), ignoriert Attributfilter. */
  jsonImportCompatible?: boolean;
  /** Standard: `subtree`. Bei `card` werden Kinder nicht exportiert. */
  scope?: BranchExportScope;
}

export const DEFAULT_SUBTREE_EXPORT_ATTRIBUTES: SubtreeExportAttributes = {
  title: true,
  link: true,
  command: true,
  description: true,
  tags: true,
  dueDate: true,
  reminderDate: true,
  effort: true,
  id: false,
  completed: true,
};

export const SUBTREE_EXPORT_ATTRIBUTE_LABELS: Record<SubtreeExportAttributeKey, string> = {
  title: "Titel",
  link: "Link",
  command: "Befehl",
  description: "Beschreibung / Notizen",
  tags: "Tags",
  dueDate: "Fälligkeit",
  reminderDate: "Erinnerung",
  effort: "Aufwand",
  id: "Karten-ID",
  completed: "Erledigt-Status",
};

export function mergeSubtreeExportAttributes(
  partial: Partial<SubtreeExportAttributes> | null | undefined,
): SubtreeExportAttributes {
  return { ...DEFAULT_SUBTREE_EXPORT_ATTRIBUTES, ...partial };
}

function headingPrefix(depth: number): string {
  const level = Math.min(Math.max(depth + 1, 1), 6);
  return "#".repeat(level) + " ";
}

function formatMarkdownHeadingTitle(
  node: TaskNode,
  attrs: SubtreeExportAttributes,
  completedTag: string,
): string {
  if (!attrs.title) {
    const href = attrs.link ? taskLinkHref(node.link) : null;
    return href ?? "(Ohne Titel)";
  }
  let text =
    attrs.link && taskLinkHref(node.link)
      ? formatObsidianTaskTitle(node)
      : (node.title.trim() || "(Ohne Titel)").replace(/\r?\n/g, " ");
  if (attrs.completed && isTaskMarkedDone(node, completedTag)) {
    text = `~~${text}~~`;
  }
  return text;
}

function appendMarkdownAttributeLines(
  lines: string[],
  node: TaskNode,
  attrs: SubtreeExportAttributes,
  options: SubtreeBranchExportOptions,
  depth: number,
): void {
  const href = taskLinkHref(node.link);
  if (attrs.link && href && !attrs.title) {
    lines.push(`- **Link:** ${href}`);
  }
  const command = attrs.command ? getTaskCommand(node.command) : null;
  if (command && !attrs.title) {
    lines.push(`- **Befehl:** \`${command.replace(/`/g, "\\`")}\``);
  }

  if (attrs.id) {
    lines.push(`- **ID:** \`${formatTaskIdForDisplay(node.id)}\``);
  }

  if (attrs.completed) {
    lines.push(
      `- **Status:** ${isTaskMarkedDone(node, options.completedTag) ? "erledigt" : "offen"}`,
    );
  }

  if (attrs.tags && node.tags.length > 0) {
    lines.push(`- **Tags:** ${node.tags.join(", ")}`);
  }

  if (attrs.reminderDate && node.reminderDate) {
    lines.push(`- **Erinnerung:** ${formatObsidianTasksDate(node.reminderDate)}`);
  }

  if (attrs.dueDate && node.dueDate) {
    lines.push(`- **Fällig:** ${formatObsidianTasksDate(node.dueDate)}`);
  }

  if (attrs.effort && options.effortOnTasksEnabled !== false && node.effort > 0) {
    const effortStr = formatEffortValue(node.effort, getEffortUnit(node));
    if (effortStr) lines.push(`- **Aufwand:** ${effortStr}`);
  }

  if (attrs.description && node.description.trim()) {
    const indent = depth > 0 ? "\t".repeat(depth) : "";
    appendMarkdownDescriptionLines(lines, node.description, indent);
  }
}

function walkMarkdown(
  lines: string[],
  node: TaskNode,
  depth: number,
  options: SubtreeBranchExportOptions,
): void {
  const { attributes: attrs } = options;
  lines.push(`${headingPrefix(depth)}${formatMarkdownHeadingTitle(node, attrs, options.completedTag)}`);
  appendMarkdownAttributeLines(lines, node, attrs, options, depth);
  lines.push("");
  for (const child of node.children) {
    walkMarkdown(lines, child, depth + 1, options);
  }
}

/** Markdown mit Überschriften pro Ebene (# … ######). */
export function taskSubtreeToHeadingMarkdown(
  root: TaskNode,
  options: SubtreeBranchExportOptions,
): string {
  const lines: string[] = [
    "<!-- Hierarchical Task Manager — Zweig-Export (Markdown) -->",
    "",
  ];
  walkMarkdown(lines, root, 0, options);
  return `${lines.join("\n").trimEnd()}\n`;
}

export type BranchExportJsonNode = {
  children: BranchExportJsonNode[];
  title?: string;
  link?: string;
  command?: string;
  description?: string;
  tags?: string[];
  dueDate?: string | null;
  reminderDate?: string | null;
  effort?: number;
  effortUnit?: string;
  effortSource?: string;
  id?: string;
  completed?: boolean;
};

function nodeToBranchJson(
  node: TaskNode,
  options: SubtreeBranchExportOptions,
): BranchExportJsonNode {
  const { attributes: attrs } = options;
  const out: BranchExportJsonNode = {
    children: node.children.map((ch) => nodeToBranchJson(ch, options)),
  };

  if (attrs.title) out.title = node.title;
  if (attrs.link) {
    const href = taskLinkHref(node.link);
    if (href) out.link = href;
  }
  if (attrs.command) {
    const command = getTaskCommand(node.command);
    if (command) out.command = command;
  }
  if (attrs.description && node.description.trim()) out.description = node.description;
  if (attrs.tags && node.tags.length > 0) out.tags = [...node.tags];
  if (attrs.dueDate) out.dueDate = node.dueDate ? node.dueDate.toISOString() : null;
  if (attrs.reminderDate) {
    out.reminderDate = node.reminderDate ? node.reminderDate.toISOString() : null;
  }
  if (attrs.effort && options.effortOnTasksEnabled !== false && node.effort > 0) {
    out.effort = node.effort;
    const unit = getEffortUnit(node);
    if (unit !== "hours") out.effortUnit = unit;
    if (node.effortSource === "calculated") out.effortSource = "calculated";
  }
  if (attrs.id) out.id = node.id;
  if (attrs.completed) {
    out.completed = isTaskMarkedDone(node, options.completedTag);
  }

  return out;
}

/** JSON-Zweig (gefiltert) oder import-kompatibles Teilbaum-Dokument. */
export function taskSubtreeToBranchJson(
  root: TaskNode,
  options: SubtreeBranchExportOptions,
  meta?: { sourceNodeTitle?: string },
): string {
  if (options.jsonImportCompatible) {
    const snap: SubtreeSnapshotV1 = buildSubtreeSnapshot(root, meta);
    return stringifyExportedDocument(snap);
  }

  const payload = {
    format: "hierarchical-task-manager-branch",
    exportedAt: new Date().toISOString(),
    root: nodeToBranchJson(root, options),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/** Liefert die Export-Wurzel; bei Scope `card` ohne Kinder. */
export function prepareBranchExportRoot(
  root: TaskNode,
  scope: BranchExportScope = "subtree",
): TaskNode {
  if (scope === "card") {
    return { ...root, children: [] };
  }
  return root;
}

/** Dateiname für Direkt-Download (Markdown oder JSON). */
export function branchExportFilename(
  root: TaskNode,
  format: BranchExportFormat,
  scope: BranchExportScope = "subtree",
): string {
  const base = slugForBackupFilename(root.title.trim() || "karte").slice(0, 48);
  const kind = scope === "card" ? "karte" : "zweig";
  const ext = format === "json" ? "json" : "md";
  return `${base}-${kind}.${ext}`;
}

export function exportSubtreeBranch(
  root: TaskNode,
  options: SubtreeBranchExportOptions,
  meta?: { sourceNodeTitle?: string },
): string {
  const exportRoot = prepareBranchExportRoot(root, options.scope ?? "subtree");
  const resolvedMeta = { sourceNodeTitle: exportRoot.title, ...meta };
  if (options.format === "json") {
    return taskSubtreeToBranchJson(exportRoot, options, resolvedMeta);
  }
  return taskSubtreeToHeadingMarkdown(exportRoot, options);
}
