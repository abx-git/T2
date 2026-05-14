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
