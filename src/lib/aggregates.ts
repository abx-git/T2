import { isDateOnlyDue } from "@/lib/task-datetime";
import {
  addEffortTotals,
  aggregateEffortTotals,
  aggregateOpenEffortTotals,
  type EffortTotals,
} from "@/lib/task-effort";
import { DEFAULT_COMPLETED_TAG, isTaskMarkedDone, isTaskMilestone } from "@/lib/task-tags";
import type { TaskNode } from "@/types/task-node";

/** Kalendertag 00:00 lokal — Fälligkeit am heutigen Tag gilt noch nicht als überfällig. */
export function startOfLocalDay(d: Date = new Date()): Date {
  const x = new Date(d.getTime());
  x.setHours(0, 0, 0, 0);
  return x;
}

export function isDueOverdue(dueDate: Date | null, done: boolean): boolean {
  if (!dueDate || done) return false;
  if (isDateOnlyDue(dueDate)) {
    return dueDate.getTime() < startOfLocalDay().getTime();
  }
  return dueDate.getTime() < Date.now();
}

function minDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() <= b.getTime() ? a : b;
}

/** @deprecated Nutze `aggregateEffortTotals`. */
export function aggregateEffort(node: TaskNode): number {
  const t = aggregateEffortTotals(node);
  return t.minutes / 60 + t.workdays;
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

/** Nächste Fälligkeit nur aus offenen Karten (für KP / Planung). */
export function aggregateNextDueOpen(
  node: TaskNode,
  completedTag: string = DEFAULT_COMPLETED_TAG,
): Date | null {
  if (isTaskMarkedDone(node, completedTag)) return null;
  let next: Date | null = node.dueDate;
  for (const child of node.children) {
    next = minDate(next, aggregateNextDueOpen(child, completedTag));
  }
  return next;
}

export function formatDueHint(d: Date | null): string | null {
  if (!d) return null;
  if (isDateOnlyDue(d)) {
    return d.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Frühester überfälliger Termin im Teilbaum (eigene Karte + Nachfahren), nur nicht erledigte Karten.
 * Wird an Elternkarten weitergegeben („propagiert“).
 */
export function aggregateOverdueDue(
  node: TaskNode,
  completedTag: string = DEFAULT_COMPLETED_TAG,
): Date | null {
  let earliest: Date | null = null;
  if (isDueOverdue(node.dueDate, isTaskMarkedDone(node, completedTag))) {
    earliest = node.dueDate;
  }
  for (const child of node.children) {
    const sub = aggregateOverdueDue(child, completedTag);
    if (!sub) continue;
    earliest = earliest ? minDate(earliest, sub) : sub;
  }
  return earliest;
}

export interface ChildMilestonePreview {
  milestone: TaskNode;
  /** Summe Σ-Aufwand der Geschwister vor dem ersten Meilenstein (ohne erledigte). */
  effortBeforeMilestone: EffortTotals;
}

/**
 * Erster direkter Kind-Meilenstein in Geschwisterreihenfolge; Aufwand aller vorherigen (nicht erledigten) Geschwister.
 */
export function getNextChildMilestonePreview(
  node: TaskNode,
  completedTag: string = DEFAULT_COMPLETED_TAG,
): ChildMilestonePreview | null {
  const idx = node.children.findIndex((c) => isTaskMilestone(c));
  if (idx < 0) return null;
  const milestone = node.children[idx];
  let effortBeforeMilestone: EffortTotals = { minutes: 0, workdays: 0 };
  for (let i = 0; i < idx; i++) {
    const sib = node.children[i];
    if (isTaskMarkedDone(sib, completedTag)) continue;
    effortBeforeMilestone = addEffortTotals(
      effortBeforeMilestone,
      aggregateOpenEffortTotals(sib, completedTag),
    );
  }
  return { milestone, effortBeforeMilestone };
}

export { aggregateEffortTotals } from "@/lib/task-effort";
