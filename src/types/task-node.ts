/**
 * Ein Knoten im Aufgabenbaum.
 * `dueDate` / `reminderDate` sind echte `Date`-Instanzen im Client-State (nicht persistiert).
 * `tags` sind freie Schlagworte; das Tag „Erledigt“ (Groß-/Kleinschreibung egal) steuert Filter und Darstellung.
 */
export interface TaskNode {
  id: string;
  title: string;
  description: string;
  tags: string[];
  dueDate: Date | null;
  reminderDate: Date | null;
  effort: number;
  children: TaskNode[];
}

/** Felder, die im Bearbeiten-Dialog geändert werden können. */
export type TaskCardEditableFields = Pick<
  TaskNode,
  "title" | "description" | "tags" | "dueDate" | "reminderDate" | "effort"
>;
