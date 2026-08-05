import { isTaskMarkedDone } from "@/lib/task-tags";
import { isNoteNode } from "@/lib/tree-node-kind";
import type { TaskNode } from "@/types/task-node";

/** Einheit des Aufwands pro Karte. Fehlt im Export → Stunden (Legacy). */
export type EffortUnit = "hours" | "minutes" | "workdays";

/** `manual` = Wert eingeben; `calculated` = Summe der offenen direkten Kinder. */
export type EffortSource = "manual" | "calculated";

export const EFFORT_SOURCES: EffortSource[] = ["manual", "calculated"];

export const EFFORT_UNITS: EffortUnit[] = ["hours", "minutes", "workdays"];

export const DEFAULT_EFFORT_UNIT: EffortUnit = "hours";

export interface EffortTotals {
  /** Stunden und Minuten als Gesamtminuten. */
  minutes: number;
  /** Werktage (für Kalender / kritischer Pfad ohne Sa/So). */
  workdays: number;
}

export function getEffortUnit(node: Pick<TaskNode, "effortUnit">): EffortUnit {
  const u = node.effortUnit;
  return u && EFFORT_UNITS.includes(u) ? u : DEFAULT_EFFORT_UNIT;
}

export function parseEffortUnit(raw: unknown): EffortUnit | undefined {
  if (raw === "hours" || raw === "minutes" || raw === "workdays") return raw;
  return undefined;
}

export function getEffortSource(node: Pick<TaskNode, "effortSource">): EffortSource {
  const s = node.effortSource;
  return s === "calculated" ? "calculated" : "manual";
}

export function parseEffortSource(raw: unknown): EffortSource | undefined {
  if (raw === "manual" || raw === "calculated") return raw;
  return undefined;
}

/** Minutenanteil eines Einzelwerts (Werktage → 0). */
export function effortToMinutes(effort: number, unit: EffortUnit): number {
  if (!Number.isFinite(effort) || effort <= 0) return 0;
  switch (unit) {
    case "minutes":
      return effort;
    case "hours":
      return effort * 60;
    case "workdays":
      return 0;
  }
}

export function effortWorkdays(effort: number, unit: EffortUnit): number {
  if (!Number.isFinite(effort) || effort <= 0) return 0;
  return unit === "workdays" ? effort : 0;
}

export function effortFromNode(node: Pick<TaskNode, "effort" | "effortUnit">): EffortTotals {
  const unit = getEffortUnit(node);
  return {
    minutes: effortToMinutes(node.effort, unit),
    workdays: effortWorkdays(node.effort, unit),
  };
}

export function emptyEffortTotals(): EffortTotals {
  return { minutes: 0, workdays: 0 };
}

export function addEffortTotals(a: EffortTotals, b: EffortTotals): EffortTotals {
  return { minutes: a.minutes + b.minutes, workdays: a.workdays + b.workdays };
}

export function effortTotalsIsEmpty(t: EffortTotals): boolean {
  return t.minutes <= 0 && t.workdays <= 0;
}

/** Gewicht für Vergleich längster Kette (Werktage ≈ 8h/Tag). */
export const MINUTES_PER_WORKDAY_FOR_COMPARE = 8 * 60;

export function effortTotalsWeight(t: EffortTotals): number {
  return t.minutes + t.workdays * MINUTES_PER_WORKDAY_FOR_COMPARE;
}

/** Effektiver Aufwand dieser Karte (bei `calculated`: Summe offener Kinder). */
export function getEffectiveEffortTotals(node: TaskNode, completedTag: string): EffortTotals {
  if (isNoteNode(node)) return emptyEffortTotals();
  if (getEffortSource(node) === "calculated") {
    let totals = emptyEffortTotals();
    for (const child of node.children) {
      if (isNoteNode(child) || isTaskMarkedDone(child, completedTag)) continue;
      totals = addEffortTotals(totals, getEffectiveEffortTotals(child, completedTag));
    }
    return totals;
  }
  return effortFromNode(node);
}

/** Σ für Anzeige: bei manuell eigener + Teilbäume; bei berechnet nur effektiver Wert (ohne Doppelzählung). */
export function rollupDisplayTotals(node: TaskNode, completedTag: string): EffortTotals {
  if (isNoteNode(node) || isTaskMarkedDone(node, completedTag)) return emptyEffortTotals();
  if (getEffortSource(node) === "calculated") {
    return getEffectiveEffortTotals(node, completedTag);
  }
  let totals = effortFromNode(node);
  for (const child of node.children) {
    if (isNoteNode(child) || isTaskMarkedDone(child, completedTag)) continue;
    totals = addEffortTotals(totals, rollupDisplayTotals(child, completedTag));
  }
  return totals;
}

/** Σ Aufwand: eigener Wert + Summe aller Nachfahren (ohne Berücksichtigung von calculated). */
export function aggregateEffortTotals(node: TaskNode): EffortTotals {
  if (isNoteNode(node)) return emptyEffortTotals();
  let totals = effortFromNode(node);
  for (const child of node.children) {
    if (isNoteNode(child)) continue;
    totals = addEffortTotals(totals, aggregateEffortTotals(child));
  }
  return totals;
}

/** Σ nur offene Karten — mit korrekter calculated-Semantik. */
export function aggregateOpenEffortTotals(node: TaskNode, completedTag: string): EffortTotals {
  return rollupDisplayTotals(node, completedTag);
}

/** Aus Summen-Totals einen gespeicherten Wert + Einheit ableiten. */
export function effortTotalsToStoredFields(
  totals: EffortTotals,
  fallbackUnit: EffortUnit = DEFAULT_EFFORT_UNIT,
): { effort: number; effortUnit: EffortUnit } {
  if (totals.workdays > 0 && totals.minutes <= 0) {
    return { effort: totals.workdays, effortUnit: "workdays" };
  }
  if (totals.minutes > 0 && totals.workdays <= 0 && totals.minutes % 60 === 0) {
    return { effort: totals.minutes / 60, effortUnit: "hours" };
  }
  if (totals.minutes > 0 && totals.workdays <= 0) {
    return { effort: totals.minutes, effortUnit: "minutes" };
  }
  if (totals.workdays > 0 && totals.minutes > 0) {
    return { effort: totals.minutes, effortUnit: "minutes" };
  }
  return { effort: 0, effortUnit: fallbackUnit };
}

/** Berechnet `effort` / `effortUnit` aus direkten offenen Kindern (für calculated). */
export function calculateEffortFieldsFromChildren(
  node: TaskNode,
  completedTag: string,
): { effort: number; effortUnit: EffortUnit } {
  let totals = emptyEffortTotals();
  for (const child of node.children) {
    if (isNoteNode(child) || isTaskMarkedDone(child, completedTag)) continue;
    totals = addEffortTotals(totals, getEffectiveEffortTotals(child, completedTag));
  }
  return effortTotalsToStoredFields(totals, getEffortUnit(node));
}

/** Nachbearbeitung: alle `calculated`-Knoten bottom-up neu aus Kindern (Post-Order). */
export function refreshCalculatedEffortsInTree(roots: TaskNode[], completedTag: string): TaskNode[] {
  function walk(nodes: TaskNode[]): TaskNode[] {
    return nodes.map((n) => {
      const children = walk(n.children);
      const base: TaskNode = { ...n, children };
      if (getEffortSource(base) !== "calculated") return base;
      const { effort, effortUnit } = calculateEffortFieldsFromChildren(base, completedTag);
      return { ...base, effort, effortUnit, effortSource: "calculated" as const };
    });
  }
  return walk(roots);
}

export function formatEffortValue(effort: number, unit: EffortUnit): string {
  if (effort <= 0) return "";
  switch (unit) {
    case "hours": {
      const rounded = Math.round(effort * 10) / 10;
      return `${Number.isInteger(rounded) ? rounded : rounded.toString().replace(".", ",")}h`;
    }
    case "minutes": {
      if (effort >= 60) {
        const h = Math.floor(effort / 60);
        const m = Math.round(effort % 60);
        return m > 0 ? `${h}h ${m}min` : `${h}h`;
      }
      return `${Math.round(effort)}min`;
    }
    case "workdays": {
      const n = Math.round(effort * 10) / 10;
      const label = n === 1 ? "Werktag" : "Werktage";
      return `${Number.isInteger(n) ? n : n.toString().replace(".", ",")} ${label}`;
    }
  }
}

export function formatEffortTotals(t: EffortTotals): string {
  const parts: string[] = [];
  if (t.workdays > 0) {
    parts.push(formatEffortValue(t.workdays, "workdays"));
  }
  if (t.minutes > 0) {
    const h = t.minutes / 60;
    if (h >= 1 && Math.abs(h - Math.round(h * 10) / 10) < 0.01) {
      parts.push(formatEffortValue(h, "hours"));
    } else if (t.minutes >= 60) {
      parts.push(formatEffortValue(t.minutes, "minutes"));
    } else {
      parts.push(formatEffortValue(t.minutes, "minutes"));
    }
  }
  return parts.join(" + ");
}

export const EFFORT_UNIT_LABELS: Record<EffortUnit, string> = {
  hours: "Stunden",
  minutes: "Minuten",
  workdays: "Werktage",
};
