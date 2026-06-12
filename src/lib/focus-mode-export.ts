import { formatDueHint, isDueOverdue } from "@/lib/aggregates";
import type { CardFieldVisibility } from "@/lib/card-field-visibility";
import { buildFocusOutlineRows, countFocusSubtree } from "@/lib/focus-mode-outline";
import { formatObsidianTasksDate } from "@/lib/obsidian-tasks-export";
import { formatEffortValue, getEffortUnit } from "@/lib/task-effort";
import { formatTaskIdForDisplay } from "@/lib/task-id";
import { taskLinkHref } from "@/lib/task-link";
import { isTaskMarkedDone, tagsWithoutCompletedTag } from "@/lib/task-tags";
import { findNodeById } from "@/lib/tree-utils";
import { downloadTextFile } from "@/lib/task-tree-json";
import type { TaskNode } from "@/types/task-node";

export interface FocusExportOptions {
  hideCompletedTasks: boolean;
  completedTag: string;
  fieldVisibility: CardFieldVisibility;
  breadcrumbTitles: string[];
  exportedAt?: Date;
}

export interface FocusExportLine {
  node: TaskNode;
  /** 0 = Fokus-Wurzel, 1+ = Unterpunkte. */
  depth: number;
}

export interface FocusExportDocument {
  focusTitle: string;
  breadcrumb: string[];
  stats: { total: number; done: number; open: number };
  lines: FocusExportLine[];
  exportedAt: Date;
}

function displayTitle(title: string): string {
  const t = title.trim();
  return t || "(Ohne Titel)";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildFocusExportDocument(
  roots: TaskNode[],
  focusNodeId: string,
  options: FocusExportOptions,
): FocusExportDocument | null {
  const focus = findNodeById(roots, focusNodeId);
  if (!focus) return null;

  const rows = buildFocusOutlineRows(
    roots,
    focusNodeId,
    options.hideCompletedTasks,
    options.completedTag,
  );

  return {
    focusTitle: displayTitle(focus.title),
    breadcrumb: options.breadcrumbTitles.map(displayTitle),
    stats: countFocusSubtree(focus, options.completedTag),
    lines: [
      { node: focus, depth: 0 },
      ...rows.map((row) => ({ node: row.node, depth: row.depth })),
    ],
    exportedAt: options.exportedAt ?? new Date(),
  };
}

function appendNodeMetaMarkdown(
  lines: string[],
  node: TaskNode,
  done: boolean,
  depth: number,
  fieldVisibility: CardFieldVisibility,
  completedTag: string,
): void {
  const meta: string[] = [];

  if (fieldVisibility.dueDate && node.dueDate) {
    const hint = formatDueHint(node.dueDate);
    if (hint) {
      const overdue = isDueOverdue(node.dueDate, done);
      meta.push(overdue ? `überfällig ${hint}` : hint);
    }
  }
  if (fieldVisibility.reminderDate && node.reminderDate) {
    meta.push(`Erinnerung ${formatObsidianTasksDate(node.reminderDate)}`);
  }
  if (fieldVisibility.tags) {
    const tags = tagsWithoutCompletedTag(node.tags, completedTag);
    if (tags.length > 0) meta.push(tags.join(", "));
  }
  if (fieldVisibility.effort && node.effort > 0) {
    const effort = formatEffortValue(node.effort, getEffortUnit(node));
    if (effort) meta.push(`Aufwand ${effort}`);
  }
  if (fieldVisibility.id) {
    meta.push(`ID ${formatTaskIdForDisplay(node.id)}`);
  }
  if (fieldVisibility.link) {
    const href = taskLinkHref(node.link);
    if (href) meta.push(href);
  }

  const indent = "  ".repeat(depth + 1);
  if (meta.length > 0) {
    lines.push(`${indent}_${meta.join(" · ")}_`);
  }

  if (fieldVisibility.description && node.description.trim()) {
    for (const part of node.description.trim().split(/\r?\n/)) {
      lines.push(`${indent}> ${part}`);
    }
  }
}

/** Markdown-Checkliste (Obsidian-kompatibel) für Druck/Archiv. */
export function focusExportToMarkdown(
  doc: FocusExportDocument,
  options: Pick<FocusExportOptions, "completedTag" | "fieldVisibility">,
): string {
  const lines: string[] = [
    "<!-- Hierarchical Task Manager — Fokus-Export -->",
    "",
    `# ${doc.focusTitle}`,
    "",
  ];

  if (doc.breadcrumb.length > 0) {
    lines.push(`**Pfad:** ${doc.breadcrumb.join(" › ")}`, "");
  }

  lines.push(
    `**Stand:** ${doc.exportedAt.toLocaleString(undefined, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })} · **Erledigt:** ${doc.stats.done}/${doc.stats.total}`,
    "",
  );

  for (const { node, depth } of doc.lines) {
    const done = isTaskMarkedDone(node, options.completedTag);
    const indent = "  ".repeat(depth);
    const box = done ? "[x]" : "[ ]";
    lines.push(`${indent}- ${box} ${displayTitle(node.title)}`);
    appendNodeMetaMarkdown(
      lines,
      node,
      done,
      depth,
      options.fieldVisibility,
      options.completedTag,
    );
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

/** Einfache Text-Gliederung (Einrückung per Tab). */
export function focusExportToPlainText(
  doc: FocusExportDocument,
  options: Pick<FocusExportOptions, "completedTag" | "fieldVisibility">,
): string {
  const lines: string[] = [doc.focusTitle, ""];

  if (doc.breadcrumb.length > 0) {
    lines.push(`Pfad: ${doc.breadcrumb.join(" › ")}`, "");
  }

  lines.push(
    `Stand: ${doc.exportedAt.toLocaleString()} · Erledigt: ${doc.stats.done}/${doc.stats.total}`,
    "",
  );

  for (const { node, depth } of doc.lines) {
    const done = isTaskMarkedDone(node, options.completedTag);
    const prefix = done ? "✓ " : "○ ";
    lines.push(`${"\t".repeat(depth)}${prefix}${displayTitle(node.title)}`);

    const meta: string[] = [];
    if (options.fieldVisibility.dueDate && node.dueDate) {
      const hint = formatDueHint(node.dueDate);
      if (hint) meta.push(hint);
    }
    if (options.fieldVisibility.tags) {
      const tags = tagsWithoutCompletedTag(node.tags, options.completedTag);
      if (tags.length > 0) meta.push(tags.join(", "));
    }
    if (meta.length > 0) {
      lines.push(`${"\t".repeat(depth + 1)}${meta.join(" · ")}`);
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function focusExportToPrintHtml(
  doc: FocusExportDocument,
  options: Pick<FocusExportOptions, "completedTag" | "fieldVisibility">,
): string {
  const exportedLabel = doc.exportedAt.toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const itemHtml = doc.lines
    .map(({ node, depth }) => {
      const done = isTaskMarkedDone(node, options.completedTag);
      const title = escapeHtml(displayTitle(node.title));
      const meta: string[] = [];

      if (options.fieldVisibility.dueDate && node.dueDate) {
        const hint = formatDueHint(node.dueDate);
        if (hint) {
          const overdue = isDueOverdue(node.dueDate, done);
          meta.push(
            overdue
              ? `<span class="overdue">überfällig ${escapeHtml(hint)}</span>`
              : escapeHtml(hint),
          );
        }
      }
      if (options.fieldVisibility.tags) {
        const tags = tagsWithoutCompletedTag(node.tags, options.completedTag);
        if (tags.length > 0) {
          meta.push(
            tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join(" "),
          );
        }
      }
      if (options.fieldVisibility.description && node.description.trim()) {
        meta.push(
          `<span class="desc">${escapeHtml(node.description.trim()).replace(/\n/g, "<br>")}</span>`,
        );
      }

      const metaBlock =
        meta.length > 0 ? `<div class="meta">${meta.join(" · ")}</div>` : "";

      return `<li class="item depth-${depth}${done ? " done" : ""}" style="--depth:${depth}">
        <span class="mark" aria-hidden="true">${done ? "☑" : "☐"}</span>
        <div class="body">
          <span class="title">${title}</span>
          ${metaBlock}
        </div>
      </li>`;
    })
    .join("\n");

  const breadcrumbHtml =
    doc.breadcrumb.length > 0
      ? `<p class="breadcrumb">${escapeHtml(doc.breadcrumb.join(" › "))}</p>`
      : "";

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(doc.focusTitle)} — Fokus</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      font-size: 11pt;
      line-height: 1.45;
      color: #1e293b;
      margin: 1.2cm 1.5cm;
    }
    h1 {
      font-size: 16pt;
      font-weight: 700;
      margin: 0 0 0.35rem;
      line-height: 1.25;
    }
    .breadcrumb {
      margin: 0 0 0.5rem;
      font-size: 9pt;
      color: #64748b;
    }
    .stats {
      margin: 0 0 1rem;
      font-size: 9pt;
      color: #64748b;
    }
    ul.outline {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .item {
      display: flex;
      gap: 0.45rem;
      align-items: flex-start;
      padding: 0.2rem 0;
      margin-left: calc(var(--depth) * 1.1rem);
      break-inside: avoid;
    }
    .item.depth-0 {
      margin-left: 0;
      padding: 0.35rem 0 0.5rem;
      border-bottom: 1px solid #e2e8f0;
      margin-bottom: 0.35rem;
    }
    .mark {
      flex-shrink: 0;
      width: 1rem;
      font-size: 10pt;
      line-height: 1.35;
      color: #64748b;
    }
    .title {
      font-weight: 500;
    }
    .item.depth-0 .title { font-size: 12pt; font-weight: 700; }
    .item.done .title {
      color: #94a3b8;
      text-decoration: line-through;
    }
    .meta {
      margin-top: 0.1rem;
      font-size: 9pt;
      color: #64748b;
    }
    .tag {
      display: inline-block;
      padding: 0 0.25rem;
      border: 1px solid #cbd5e1;
      border-radius: 3px;
      font-size: 8pt;
    }
    .overdue { color: #b91c1c; font-weight: 600; }
    .desc { display: block; margin-top: 0.15rem; white-space: pre-wrap; }
    @media print {
      body { margin: 0.8cm 1cm; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(doc.focusTitle)}</h1>
  ${breadcrumbHtml}
  <p class="stats">${escapeHtml(exportedLabel)} · ${doc.stats.done}/${doc.stats.total} erledigt</p>
  <ul class="outline">
    ${itemHtml}
  </ul>
</body>
</html>`;
}

export function focusExportFilename(title: string, ext: string, at = new Date()): string {
  const stamp = at.toISOString().slice(0, 10);
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `fokus-${slug || "export"}-${stamp}.${ext}`;
}

export function downloadFocusOutlineMarkdown(
  roots: TaskNode[],
  focusNodeId: string,
  options: FocusExportOptions,
): boolean {
  const doc = buildFocusExportDocument(roots, focusNodeId, options);
  if (!doc) return false;
  const text = focusExportToMarkdown(doc, options);
  downloadTextFile(focusExportFilename(doc.focusTitle, "md", doc.exportedAt), text, "text/markdown");
  return true;
}

export function downloadFocusOutlinePlainText(
  roots: TaskNode[],
  focusNodeId: string,
  options: FocusExportOptions,
): boolean {
  const doc = buildFocusExportDocument(roots, focusNodeId, options);
  if (!doc) return false;
  const text = focusExportToPlainText(doc, options);
  downloadTextFile(focusExportFilename(doc.focusTitle, "txt", doc.exportedAt), text, "text/plain");
  return true;
}

export function printFocusOutline(
  roots: TaskNode[],
  focusNodeId: string,
  options: FocusExportOptions,
): boolean {
  const doc = buildFocusExportDocument(roots, focusNodeId, options);
  if (!doc) return false;

  const html = focusExportToPrintHtml(doc, options);
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) return false;

  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();

  const triggerPrint = () => {
    win.print();
    win.onafterprint = () => win.close();
  };

  if (win.document.readyState === "complete") {
    triggerPrint();
  } else {
    win.onload = triggerPrint;
  }

  return true;
}
