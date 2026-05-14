import { uniqNonEmptyTags } from "@/lib/task-tags";
import type { TaskNode } from "@/types/task-node";

const NS_HINT = "hierarchical-task-manager";

function escAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseIsoDate(s: string | null): Date | null {
  if (!s?.trim()) return null;
  const d = new Date(s.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseEffort(s: string | null): number {
  if (!s?.trim()) return 0;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function readNoteDescription(el: Element): string {
  for (const ch of el.children) {
    if (ch.tagName.toLowerCase() === "richcontent" && ch.getAttribute("TYPE") === "NOTE") {
      return stripHtml(ch.innerHTML ?? "");
    }
  }
  return "";
}

function readMmNode(el: Element): TaskNode {
  const title = el.getAttribute("TEXT")?.trim() ?? "";
  const desc = readNoteDescription(el);
  const tags = uniqNonEmptyTags(
    (el.getAttribute("HIER_TM_TAGS") ?? "")
      .split("|")
      .map((x) => x.trim())
      .filter(Boolean),
  );
  const effort = parseEffort(el.getAttribute("HIER_TM_EFFORT"));
  const dueDate = parseIsoDate(el.getAttribute("HIER_TM_DUE"));
  const reminderDate = parseIsoDate(el.getAttribute("HIER_TM_REMINDER"));

  const children: TaskNode[] = [];
  for (const ch of el.children) {
    if (ch.tagName.toLowerCase() === "node") {
      children.push(readMmNode(ch));
    }
  }

  return {
    id: crypto.randomUUID(),
    title,
    description: desc,
    tags,
    dueDate,
    reminderDate,
    effort,
    children,
  };
}

/**
 * Liest eine FreeMind-/Freeplane-kompatible `.mm`-XML-Datei und liefert Wurzelknoten.
 * Mehrere Board-Wurzeln: Export nutzt einen Wrapper-Knoten mit `HIER_TM_WRAPPER="1"`.
 */
export function parseFreemindMmToRoots(xmlText: string): TaskNode[] {
  const trimmed = xmlText.trim();
  if (!trimmed.startsWith("<")) throw new Error("Keine XML-Mindmap (.mm).");

  const doc = new DOMParser().parseFromString(trimmed, "application/xml");
  const err = doc.querySelector("parsererror");
  if (err) throw new Error("XML konnte nicht gelesen werden.");

  const map = doc.querySelector("map");
  if (!map) throw new Error("Kein <map>-Element (FreeMind .mm erwartet).");

  const topNodes = [...map.children].filter((c) => c.tagName.toLowerCase() === "node");
  if (topNodes.length === 0) throw new Error("Mindmap ohne Knoten.");

  if (topNodes.length === 1) {
    const only = topNodes[0]!;
    if (only.getAttribute("HIER_TM_WRAPPER") === "1") {
      return [...only.children]
        .filter((c) => c.tagName.toLowerCase() === "node")
        .map((c) => readMmNode(c));
    }
    return [readMmNode(only)];
  }

  return topNodes.map((n) => readMmNode(n));
}

function noteXml(description: string): string {
  if (!description.trim()) return "";
  const body = escAttr(description);
  return `<richcontent TYPE="NOTE"><html><head></head><body><p>${body}</p></body></html></richcontent>`;
}

function taskToMmXml(node: TaskNode, depth: number): string {
  const pad = "  ".repeat(depth);
  const tags = node.tags.length ? ` HIER_TM_TAGS="${escAttr(node.tags.join("|"))}"` : "";
  const eff = node.effort > 0 ? ` HIER_TM_EFFORT="${escAttr(String(node.effort))}"` : "";
  const due = node.dueDate ? ` HIER_TM_DUE="${escAttr(node.dueDate.toISOString())}"` : "";
  const rem = node.reminderDate ? ` HIER_TM_REMINDER="${escAttr(node.reminderDate.toISOString())}"` : "";
  const note = noteXml(node.description);
  const childXml = node.children.map((c) => taskToMmXml(c, depth + 1)).join("");
  const textAttr = escAttr(node.title);
  if (!node.children.length && !note) {
    return `${pad}<node TEXT="${textAttr}"${tags}${eff}${due}${rem}/>\n`;
  }
  return `${pad}<node TEXT="${textAttr}"${tags}${eff}${due}${rem}>\n${note}${childXml}${pad}</node>\n`;
}

/** Serialisiert den Board-Baum als FreeMind-XML (UTF-8, eine map-Wurzel). */
export function taskRootsToFreemindMm(roots: TaskNode[]): string {
  let inner: string;
  if (roots.length === 1) {
    inner = taskToMmXml(roots[0]!, 2);
  } else {
    const children = roots.map((r) => taskToMmXml(r, 3)).join("");
    inner = `  <node TEXT="Board" HIER_TM_WRAPPER="1" FOLDED="false">\n${children}  </node>\n`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<map version="1.0.1">\n<!-- ${NS_HINT}: Mehrere Wurzeln liegen unter dem Wrapper-Knoten mit HIER_TM_WRAPPER="1". -->\n${inner}</map>\n`;
}
