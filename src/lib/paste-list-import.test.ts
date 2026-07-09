import { describe, expect, it } from "vitest";

import { buildPasteListCards, parsePasteListLines } from "./paste-list-import";

describe("parsePasteListLines", () => {
  it("splits on newlines and drops empty lines", () => {
    expect(parsePasteListLines("a\n\n b \r\nc")).toEqual(["a", "b", "c"]);
  });
});

describe("buildPasteListCards", () => {
  it("creates one card per line", () => {
    expect(buildPasteListCards(["A", "B"], "per-line", false)).toEqual([
      { title: "A", description: "" },
      { title: "B", description: "" },
    ]);
  });

  it("splits first line as title and rest as description", () => {
    expect(buildPasteListCards(["Titel", "Zeile 2", "Zeile 3"], "single", true)).toEqual([
      { title: "Titel", description: "Zeile 2\nZeile 3" },
    ]);
  });

  it("joins all lines as title when not splitting", () => {
    expect(buildPasteListCards(["A", "B"], "single", false)).toEqual([
      { title: "A\nB", description: "" },
    ]);
  });
});
