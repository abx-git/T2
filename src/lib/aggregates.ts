import type { TaskNode } from "@/types/task-node";

function minDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() <= b.getTime() ? a : b;
}

/** Eigener Aufwand + Summe aller Nachfahren (Bottom-Up). */
export function aggregateEffort(node: TaskNode): number {
  const childTotal = node.children.reduce((sum, c) => sum + aggregateEffort(c), 0);
  return node.effort + childTotal;
}

/**
 * Nächster fälliger Termin: Minimum aus eigenem `dueDate` und allen aggregierten Kind-Terminen.
 */
export function aggregateNextDue(node: TaskNode): Date | null {
  let next: Date | null = node.dueDate;
  for (const child of node.children) {
    next = minDate(next, aggregateNextDue(child));
  }
  return next;
}

export function formatDueHint(d: Date | null): string | null {
  if (!d) return null;
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
