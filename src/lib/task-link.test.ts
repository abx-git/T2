import { describe, expect, it } from "vitest";

import { normalizeTaskLink, taskLinkHref } from "./task-link";

describe("task-link", () => {
  it("normalisiert fehlendes Schema zu https", () => {
    expect(normalizeTaskLink("example.com/path")).toBe("https://example.com/path");
  });

  it("lehnt unsichere Protokolle ab", () => {
    expect(normalizeTaskLink("javascript:alert(1)")).toBe("");
    expect(normalizeTaskLink("data:text/html,<script>")).toBe("");
  });

  it("erlaubt benutzerdefinierte Schemas wie obsidian", () => {
    const obsidian = "obsidian://open?vault=Notes&file=Task.md";
    expect(normalizeTaskLink(obsidian)).toBe(obsidian);
    expect(taskLinkHref(obsidian)).toBe(obsidian);
  });

  it("taskLinkHref liefert null bei leerem Wert", () => {
    expect(taskLinkHref("")).toBeNull();
    expect(taskLinkHref("  ")).toBeNull();
  });
});
