import { formatDueHint } from "@/lib/aggregates";
import {
  addEffortTotals,
  getEffectiveEffortTotals,
  effortTotalsIsEmpty,
  effortTotalsWeight,
  emptyEffortTotals,
  formatEffortTotals,
  type EffortTotals,
} from "@/lib/task-effort";
import { isTaskMarkedDone } from "@/lib/task-tags";
import type { TaskNode } from "@/types/task-node";

export interface CriticalPathHintOptions {
  /** Fälligkeit: KP endet hier (mit Uhrzeit), keine Projektion ab „jetzt“. */
  deadline?: Date | null;
  /** Angezeigte Dauer (z. B. Σ-Aufwand); sonst `cpTotals`. */
  durationTotals?: EffortTotals;
}

/** Längste offene Kette (kritischer Pfad): ohne erledigte Karten. */
export function criticalPathTotals(node: TaskNode, completedTag: string): EffortTotals {
  if (isTaskMarkedDone(node, completedTag)) return emptyEffortTotals();
  const own = getEffectiveEffortTotals(node, completedTag);
  const openChildren = node.children.filter((c) => !isTaskMarkedDone(c, completedTag));
  if (!openChildren.length) return own;

  let maxChild = emptyEffortTotals();
  let maxWeight = -1;
  for (const child of openChildren) {
    const cp = criticalPathTotals(child, completedTag);
    const w = effortTotalsWeight(cp);
    if (w > maxWeight) {
      maxWeight = w;
      maxChild = cp;
    }
  }
  return addEffortTotals(own, maxChild);
}

/** Werktage vorwärts; Samstag und Sonntag zählen nicht. */
export function addWorkdays(start: Date, workdays: number): Date {
  if (workdays <= 0) return new Date(start.getTime());
  const d = new Date(start.getTime());
  let remaining = workdays;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) remaining -= 1;
  }
  return d;
}

/** Voraussichtliches Ende des kritischen Pfads ab `start` (Werktage ohne Wochenende, dann Minuten kalenderisch). */
export function projectCriticalPathEnd(start: Date, totals: EffortTotals): Date {
  let d = new Date(start.getTime());
  if (totals.workdays > 0) {
    d = addWorkdays(d, totals.workdays);
  }
  if (totals.minutes > 0) {
    d = new Date(d.getTime() + totals.minutes * 60_000);
  }
  return d;
}

export function formatCriticalPathHint(
  cpTotals: EffortTotals,
  opts?: CriticalPathHintOptions,
): string | null {
  const options = opts ?? {};
  const durationTotals = options.durationTotals ?? cpTotals;
  const duration = formatEffortTotals(durationTotals);
  if (!duration) return null;

  const deadline = options.deadline;
  if (deadline) {
    const endStr = formatDueHint(deadline);
    return endStr ? `KP ${duration} → ${endStr}` : `KP ${duration}`;
  }

  if (effortTotalsIsEmpty(cpTotals)) return null;
  /** Ohne Fälligkeit: nur Dauer (längster Ast), keine Projektion ab „jetzt“. */
  return `KP ${duration}`;
}
