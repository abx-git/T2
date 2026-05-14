/** Standard-Titel für Spalten (Index 0 = Wurzel). */
export function defaultColumnTitle(columnIndex: number): string {
  if (columnIndex === 0) return "Hauptebene";
  return `Ebene ${columnIndex + 1}`;
}

export function resolveColumnDisplayTitle(
  overrides: Readonly<Record<number, string>>,
  columnIndex: number,
): string {
  const v = overrides[columnIndex]?.trim();
  return v || defaultColumnTitle(columnIndex);
}

/** Aus Dialog-Zeilen: nur von den Defaults abweichende, nicht-leere Titel speichern. */
export function compactColumnTitleOverrides(draft: string[]): Record<number, string> {
  const next: Record<number, string> = {};
  draft.forEach((raw, i) => {
    const t = raw.trim();
    if (t && t !== defaultColumnTitle(i)) next[i] = t;
  });
  return next;
}
