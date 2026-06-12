import { describe, expect, it } from "vitest";

import { DEFAULT_CARD_FIELD_VISIBILITY } from "@/lib/card-field-visibility";
import {
  buildFocusExportDocument,
  focusExportFilename,
  focusExportToMarkdown,
  focusExportToPlainText,
  focusExportToPrintHtml,
} from "@/lib/focus-mode-export";
import type { TaskNode } from "@/types/task-node";

function node(
  id: string,
  title: string,
  children: TaskNode[] = [],
  extra: Partial<TaskNode> = {},
): TaskNode {
  return {
    id,
    title,
    link: "",
    description: "",
    tags: [],
    dueDate: null,
    reminderDate: null,
    effort: 0,
    children,
    ...extra,
  };
}

const roots = [
  node("a", "Projekt A", [
    node("b", "Teil B", [node("c", "Schritt C")]),
    node("d", "Erledigt", [], { tags: ["Erledigt"] }),
  ]),
];

const baseOptions = {
  hideCompletedTasks: false,
  completedTag: "Erledigt",
  fieldVisibility: { ...DEFAULT_CARD_FIELD_VISIBILITY, description: false, link: false, id: false },
  breadcrumbTitles: ["Root", "Projekt A"],
  exportedAt: new Date("2026-05-29T10:00:00.000Z"),
};

describe("buildFocusExportDocument", () => {
  it("enthält Fokus-Wurzel und sichtbare Unterpunkte", () => {
    const doc = buildFocusExportDocument(roots, "a", baseOptions);
    expect(doc).not.toBeNull();
    expect(doc!.focusTitle).toBe("Projekt A");
    expect(doc!.lines.map((l) => l.node.id)).toEqual(["a", "b", "c", "d"]);
    expect(doc!.stats).toEqual({ total: 4, done: 1, open: 3 });
  });

  it("blendet erledigte Unterpunkte aus, wenn konfiguriert", () => {
    const doc = buildFocusExportDocument(roots, "a", {
      ...baseOptions,
      hideCompletedTasks: true,
    });
    expect(doc!.lines.map((l) => l.node.id)).toEqual(["a", "b", "c"]);
  });
});

describe("focusExportToMarkdown", () => {
  it("formatiert Checkliste mit Pfad und Metadaten", () => {
    const doc = buildFocusExportDocument(roots, "a", baseOptions)!;
    const md = focusExportToMarkdown(doc, baseOptions);
    expect(md).toContain("# Projekt A");
    expect(md).toContain("**Pfad:** Root › Projekt A");
    expect(md).toContain("- [ ] Teil B");
    expect(md).toContain("  - [ ] Schritt C");
    expect(md).toContain("- [x] Erledigt");
  });
});

describe("focusExportToPlainText", () => {
  it("nutzt Einrückung und Erledigt-Markierung", () => {
    const doc = buildFocusExportDocument(roots, "a", baseOptions)!;
    const text = focusExportToPlainText(doc, baseOptions);
    expect(text).toContain("○ Teil B");
    expect(text).toContain("\t\t○ Schritt C");
    expect(text).toContain("✓ Erledigt");
  });
});

describe("focusExportToPrintHtml", () => {
  it("liefert druckbares HTML mit Titel und Liste", () => {
    const doc = buildFocusExportDocument(roots, "a", baseOptions)!;
    const html = focusExportToPrintHtml(doc, baseOptions);
    expect(html).toContain("<title>Projekt A — Fokus</title>");
    expect(html).toContain("class=\"item depth-1\"");
    expect(html).toContain("Teil B");
  });
});

describe("focusExportFilename", () => {
  it("erzeugt sicheren Dateinamen", () => {
    expect(focusExportFilename("Mein Fokus / Test", "md", new Date("2026-05-29"))).toBe(
      "fokus-mein-fokus-test-2026-05-29.md",
    );
  });
});
