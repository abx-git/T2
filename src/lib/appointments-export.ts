import { formatDueHint, isDueOverdue } from "@/lib/aggregates";
import {
  appendMarkdownDescriptionLines,
  formatObsidianTasksDate,
} from "@/lib/obsidian-tasks-export";
import { isTaskMarkedDone } from "@/lib/task-tags";
import type { TaskNode } from "@/types/task-node";

export type AppointmentKind = "due" | "reminder";

export type AppointmentsMarkdownStyle = "plain" | "obsidian";

export interface AppointmentEntry {
  nodeId: string;
  title: string;
  description: string;
  date: Date;
  kind: AppointmentKind;
  done: boolean;
  overdue: boolean;
  pathTitles: string[];
}

export interface CollectAppointmentsOptions {
  completedTag: string;
  /** Erledigte Karten mit Termin einbeziehen (Standard: ja). */
  includeDone?: boolean;
}

export interface FormatAppointmentsOptions {
  style: AppointmentsMarkdownStyle;
  completedTag: string;
  includeDone?: boolean;
}

const KIND_LABEL: Record<AppointmentKind, string> = {
  due: "Fällig",
  reminder: "Erinnerung",
};

function displayTitle(title: string): string {
  const t = title.trim();
  return t || "(Ohne Titel)";
}

function pathLabel(pathTitles: string[]): string {
  if (!pathTitles.length) return "";
  return pathTitles.map((t) => displayTitle(t)).join(" › ");
}

/** Alle Fälligkeiten und Erinnerungen aus dem Board (flach, nach Datum sortiert). */
export function collectAppointmentsFromForest(
  roots: TaskNode[],
  options: CollectAppointmentsOptions,
): AppointmentEntry[] {
  const includeDone = options.includeDone !== false;
  const entries: AppointmentEntry[] = [];

  function walk(nodes: TaskNode[], ancestors: string[]) {
    for (const node of nodes) {
      const title = displayTitle(node.title);
      const pathTitles = [...ancestors, title];
      const done = isTaskMarkedDone(node, options.completedTag);

      if (node.dueDate && (includeDone || !done)) {
        entries.push({
          nodeId: node.id,
          title,
          description: node.description,
          date: node.dueDate,
          kind: "due",
          done,
          overdue: isDueOverdue(node.dueDate, done),
          pathTitles,
        });
      }
      if (node.reminderDate && (includeDone || !done)) {
        entries.push({
          nodeId: node.id,
          title,
          description: node.description,
          date: node.reminderDate,
          kind: "reminder",
          done,
          overdue: false,
          pathTitles,
        });
      }

      walk(node.children, pathTitles);
    }
  }

  walk(roots, []);
  entries.sort((a, b) => a.date.getTime() - b.date.getTime() || a.kind.localeCompare(b.kind));
  return entries;
}

function formatPlainLine(entry: AppointmentEntry): string {
  const dateStr = formatDueHint(entry.date) ?? "";
  const parts = [`**${dateStr}**`, KIND_LABEL[entry.kind], entry.title];
  const path = pathLabel(entry.pathTitles);
  if (path) parts.push(`\`${path}\``);
  if (entry.done) parts.push("*(erledigt)*");
  else if (entry.overdue) parts.push("*(überfällig)*");
  return `- ${parts.join(" · ")}`;
}

function formatObsidianLine(entry: AppointmentEntry): string {
  const checkbox = entry.done ? "[x]" : "[ ]";
  const dateStr = formatObsidianTasksDate(entry.date);
  const emoji = entry.kind === "due" ? (entry.done ? "✅" : "📅") : "⏳";
  const path = pathLabel(entry.pathTitles);
  const pathSuffix = path ? ` — \`${path}\`` : "";
  const overdueSuffix = entry.overdue && !entry.done ? " ⚠️" : "";
  return `- ${checkbox} ${entry.title}${pathSuffix}${overdueSuffix} ${emoji} ${dateStr}`;
}

/** Markdown-Liste aller Termine (plain oder Obsidian Tasks). */
export function formatAppointmentsMarkdown(
  roots: TaskNode[],
  options: FormatAppointmentsOptions,
): string {
  const entries = collectAppointmentsFromForest(roots, {
    completedTag: options.completedTag,
    includeDone: options.includeDone,
  });

  const lines: string[] = ["# Termine", ""];

  if (!entries.length) {
    lines.push("*(Keine Fälligkeiten oder Erinnerungen im Board.)*");
    lines.push("");
    return lines.join("\n");
  }

  const open = entries.filter((e) => !e.done).length;
  lines.push(
    `*${entries.length} Einträge${open < entries.length ? ` (${open} offen)` : ""} — Fälligkeiten und Erinnerungen aller Karten*`,
    "",
  );

  for (const entry of entries) {
    lines.push(options.style === "obsidian" ? formatObsidianLine(entry) : formatPlainLine(entry));
    appendMarkdownDescriptionLines(lines, entry.description, "\t");
  }

  lines.push("");
  return lines.join("\n");
}
