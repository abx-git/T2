import { describe, expect, it } from "vitest";

import {
  createBlankNoteNode,
  isNoteNode,
  nodeDisplayTitle,
  normalizeNoteMarkdown,
  noteMarkdownPreview,
} from "./tree-node-kind";

describe("tree-node-kind", () => {
  it("erkennt Notizen an kind", () => {
    expect(isNoteNode(createBlankNoteNode("n-1"))).toBe(true);
    expect(isNoteNode({ kind: "card" } as never)).toBe(false);
  });

  it("leitet Anzeigetitel aus Markdown ab", () => {
    const note = createBlankNoteNode("n-1");
    note.markdown = "# Einführung\n\nText";
    expect(nodeDisplayTitle(note)).toBe("# Einführung");
    expect(noteMarkdownPreview(note.markdown)).toContain("Einführung");
  });

  it("normalisiert Zeilenumbrüche", () => {
    expect(normalizeNoteMarkdown("a\r\nb")).toBe("a\nb");
  });
});
