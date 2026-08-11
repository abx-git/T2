import { describe, expect, it } from "vitest";

import { applyContextListDrop } from "@/lib/context-list-dnd";
import {
  appendMarkdownBlocks,
  applyMergeIntoNote,
  convertCardNodeToNote,
  convertCardToNoteInForest,
  sourceContributionMarkdown,
} from "@/lib/note-merge";
import { createBlankNoteNode } from "@/lib/tree-node-kind";
import type { TaskNode } from "@/types/task-node";

function card(id: string, title: string, description = "", children: TaskNode[] = []): TaskNode {
  return {
    id,
    kind: "card",
    title,
    link: "",
    description,
    tags: ["x"],
    dueDate: null,
    reminderDate: null,
    effort: 0,
    children,
  };
}

function note(id: string, title: string, markdown: string, children: TaskNode[] = []): TaskNode {
  const n = createBlankNoteNode(id);
  n.title = title;
  n.markdown = markdown;
  n.children = children;
  return n;
}

describe("note-merge", () => {
  it("wandelt Karte in Notiz um (Beschreibung → Markdown)", () => {
    const converted = convertCardNodeToNote(card("c1", "Titel", "Hallo\nWelt"));
    expect(converted.kind).toBe("note");
    expect(converted.title).toBe("Titel");
    expect(converted.markdown).toContain("Hallo");
    expect(converted.tags).toEqual([]);
    expect(converted.description).toBe("");
  });

  it("ersetzt Karte im Wald", () => {
    const roots = [card("a", "A", "Text"), card("b", "B")];
    const next = convertCardToNoteInForest(roots, "a");
    expect(next[0].kind).toBe("note");
    expect(next[0].markdown).toContain("Text");
    expect(next[1].kind).toBe("card");
  });

  it("hängt Markdown-Blöcke an", () => {
    expect(appendMarkdownBlocks("Eins", "Zwei")).toBe("Eins\n\nZwei\n");
    expect(appendMarkdownBlocks("", "Nur")).toBe("Nur\n");
  });

  it("baut Beitrags-Markdown mit Titel", () => {
    expect(sourceContributionMarkdown(card("c", "Thema", "Inhalt"))).toBe(
      "## Thema\n\nInhalt",
    );
  });

  it("merged Quelle in Notiz und entfernt Quelle", () => {
    const roots = [
      note("n1", "Notiz", "Bestehend\n"),
      card("c1", "Karte", "Neu", [card("c1a", "Kind")]),
    ];
    const next = applyMergeIntoNote(roots, "c1", "n1");
    expect(next).not.toBeNull();
    expect(next!.map((n) => n.id)).toEqual(["n1"]);
    expect(next![0].markdown).toContain("Bestehend");
    expect(next![0].markdown).toContain("## Karte");
    expect(next![0].markdown).toContain("Neu");
    expect(next![0].children.map((c) => c.id)).toEqual(["c1a"]);
  });

  it("merged Notiz in Notiz", () => {
    const roots = [note("a", "A", "Eins\n"), note("b", "B", "Zwei\n")];
    const next = applyMergeIntoNote(roots, "b", "a");
    expect(next!.map((n) => n.id)).toEqual(["a"]);
    expect(next![0].markdown).toContain("Eins");
    expect(next![0].markdown).toContain("## B");
    expect(next![0].markdown).toContain("Zwei");
  });

  it("gibt null zurück wenn Ziel keine Notiz ist", () => {
    const roots = [card("a", "A"), card("b", "B")];
    expect(applyMergeIntoNote(roots, "b", "a")).toBeNull();
  });
});

describe("context nest onto note merges", () => {
  it("nest auf Notiz merged statt einzunisten", () => {
    const roots = [note("n", "N", "Base\n"), card("c", "C", "Body")];
    const next = applyContextListDrop(roots, null, "c", { kind: "nest", targetId: "n" });
    expect(next.map((n) => n.id)).toEqual(["n"]);
    expect(next[0].children).toEqual([]);
    expect(next[0].markdown).toContain("Base");
    expect(next[0].markdown).toContain("Body");
  });

  it("nest auf Karte bleibt Nest", () => {
    const roots = [card("a", "A"), card("b", "B")];
    const next = applyContextListDrop(roots, null, "b", { kind: "nest", targetId: "a" });
    expect(next.map((n) => n.id)).toEqual(["a"]);
    expect(next[0].children.map((c) => c.id)).toEqual(["b"]);
  });
});
