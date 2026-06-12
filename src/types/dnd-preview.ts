/** Entweder Spaltenfläche (nur Hauptebene) oder eine Karte — nie beides. */
export type DropTargetMode = "column" | "card";

/** Semantik des geplanten Drops (für Vorschau & Hilfetexte). */
export type DropIntent =
  | "column-end"
  | "root-sibling"
  | "reorder-sibling"
  | "reorder-gap"
  | "nest-under";

/** Live-Vorschau während des Ziehens. */
export interface BoardDropPreview {
  activeId: string;
  targetMode: DropTargetMode;
  intent: DropIntent;
  toCol: number;
  /** Bei Geschwister-Einfügen: Index in der Liste nach Entfernen der aktiven Karte. */
  insertIndex: number;
  /** Bei Karten-Ziel: Referenzkarte (dunkler Hintergrund). */
  anchorCardId: string | null;
  /** Bei Spalten-Lücke: Geschwisterliste (Eltern-ID); in der Teilbaum-Spalte zur eindeutigen Vorschau nötig. */
  gapListParentId?: string | null;
}

/** Kurzer Hinweis für Drag-Overlay und Tooltips. */
export function dropIntentLabel(intent: DropIntent | undefined): string {
  switch (intent) {
    case "nest-under":
      return "Als Unterkarte einhängen";
    case "reorder-gap":
    case "reorder-sibling":
    case "root-sibling":
      return "Hier einordnen (Geschwister)";
    case "column-end":
      return "Ans Ende der Spalte";
    default:
      return "Zweig verschieben …";
  }
}
