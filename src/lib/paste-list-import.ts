export type PasteListMode = "per-line" | "single";

export interface PasteListCardDraft {
  title: string;
  description: string;
}

/** Nicht-leere Zeilen aus eingefügtem Text (Trim pro Zeile). */
export function parsePasteListLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Kartenentwürfe aus Zeilen und gewählter Einfüge-Strategie. */
export function buildPasteListCards(
  lines: string[],
  mode: PasteListMode,
  splitTitleDescription: boolean,
): PasteListCardDraft[] {
  if (lines.length === 0) return [];

  if (mode === "per-line") {
    return lines.map((line) => ({ title: line, description: "" }));
  }

  if (lines.length === 1) {
    return [{ title: lines[0]!, description: "" }];
  }

  if (splitTitleDescription) {
    return [{ title: lines[0]!, description: lines.slice(1).join("\n") }];
  }

  return [{ title: lines.join("\n"), description: "" }];
}
