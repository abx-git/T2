import type { CardColorId } from "@/lib/card-color";
import type { EffortSource, EffortUnit } from "@/lib/task-effort";
import type { TreeNodeKind } from "@/lib/tree-node-kind";

/**
 * Ein Knoten im Aufgabenbaum.
 * `dueDate` / `reminderDate` sind echte `Date`-Instanzen (ISO in Exporten).
 * Nur Datum: lokale 00:00 oder 12:00; mit Uhrzeit: beliebige lokale Zeit.
 * `effort` + `effortUnit`: Stunden (Standard), Minuten oder Werktage.
 * `effortSource`: `manual` (eingetragen) oder `calculated` (Summe offener Kinder, per Knopf).
 * `tags` sind freie Schlagworte; das Tag „Erledigt“ (Groß-/Kleinschreibung egal) steuert Filter und Darstellung.
 * `kind: "note"` = Markdown-Notiz ohne Karten-Attribute (nur Titel + Markdown-Inhalt).
 */
export interface TaskNode {
  id: string;
  /** `card` (Standard) oder `note` für Markdown-Notizen. */
  kind?: TreeNodeKind;
  title: string;
  /** Markdown-Inhalt (nur bei `kind: "note"`). */
  markdown?: string;
  /** Externer Link; wenn gesetzt, Link-Icon und Menüpunkt „Link öffnen“. */
  link: string;
  /** Shell-Befehl; wenn gesetzt, Terminal-Icon — Klick kopiert in die Zwischenablage. */
  command?: string;
  description: string;
  tags: string[];
  dueDate: Date | null;
  reminderDate: Date | null;
  effort: number;
  effortUnit?: EffortUnit;
  effortSource?: EffortSource;
  /** Optionale Kartenfarbe (Palette); Akzentleiste bleibt auch bei Statusfarben. */
  cardColor?: CardColorId;
  children: TaskNode[];
}

/** Felder, die im Bearbeiten-Dialog geändert werden können. */
export type TaskCardEditableFields = Pick<
  TaskNode,
  | "title"
  | "link"
  | "command"
  | "description"
  | "tags"
  | "dueDate"
  | "reminderDate"
  | "effort"
  | "effortUnit"
  | "effortSource"
  | "cardColor"
>;

/** Felder, die im Notiz-Dialog geändert werden können. */
export type NoteEditableFields = Pick<TaskNode, "title" | "markdown">;
