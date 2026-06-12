import type { EffortSource, EffortUnit } from "@/lib/task-effort";

/**
 * Ein Knoten im Aufgabenbaum.
 * `dueDate` / `reminderDate` sind echte `Date`-Instanzen (ISO in Exporten).
 * Nur Datum: lokale 00:00 oder 12:00; mit Uhrzeit: beliebige lokale Zeit.
 * `effort` + `effortUnit`: Stunden (Standard), Minuten oder Werktage.
 * `effortSource`: `manual` (eingetragen) oder `calculated` (Summe offener Kinder, per Knopf).
 * `tags` sind freie Schlagworte; das Tag „Erledigt“ (Groß-/Kleinschreibung egal) steuert Filter und Darstellung.
 */
export interface TaskNode {
  id: string;
  title: string;
  /** Externer Link; wenn gesetzt, ist der Titel auf der Karte klickbar. */
  link: string;
  description: string;
  tags: string[];
  dueDate: Date | null;
  reminderDate: Date | null;
  effort: number;
  effortUnit?: EffortUnit;
  effortSource?: EffortSource;
  children: TaskNode[];
}

/** Felder, die im Bearbeiten-Dialog geändert werden können. */
export type TaskCardEditableFields = Pick<
  TaskNode,
  | "title"
  | "link"
  | "description"
  | "tags"
  | "dueDate"
  | "reminderDate"
  | "effort"
  | "effortUnit"
  | "effortSource"
>;
