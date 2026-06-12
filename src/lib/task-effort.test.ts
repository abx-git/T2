import { describe, expect, it } from "vitest";

import {
  aggregateEffortTotals,
  calculateEffortFieldsFromChildren,
  formatEffortTotals,
  formatEffortValue,
  getEffectiveEffortTotals,
  refreshCalculatedEffortsInTree,
  rollupDisplayTotals,
} from "@/lib/task-effort";
import type { TaskNode } from "@/types/task-node";

function node(
  partial: Partial<TaskNode> & Pick<TaskNode, "id" | "title">,
  children: TaskNode[] = [],
): TaskNode {
  return {
    link: "",
    description: "",
    tags: [],
    dueDate: null,
    reminderDate: null,
    effort: 0,
    children,
    ...partial,
  };
}

describe("formatEffortValue", () => {
  it("formats minutes and workdays", () => {
    expect(formatEffortValue(90, "minutes")).toBe("1h 30min");
    expect(formatEffortValue(2, "workdays")).toBe("2 Werktage");
  });
});

describe("aggregateEffortTotals", () => {
  it("sums mixed units", () => {
    const tree = node(
      { id: "p", title: "P", effort: 1, effortUnit: "hours" },
      [node({ id: "c", title: "C", effort: 2, effortUnit: "workdays" })],
    );
    expect(formatEffortTotals(aggregateEffortTotals(tree))).toBe("2 Werktage + 1h");
  });
});

describe("calculated effort", () => {
  const doneTag = "Erledigt";

  it("sums open children for calculated parent", () => {
    const tree = node(
      { id: "p", title: "P", effortSource: "calculated", effort: 0 },
      [
        node({ id: "a", title: "A", effort: 1, effortUnit: "hours" }),
        node({ id: "b", title: "B", effort: 30, effortUnit: "minutes", tags: [doneTag] }),
        node({ id: "c", title: "C", effort: 2, effortUnit: "hours" }),
      ],
    );
    const refreshed = refreshCalculatedEffortsInTree([tree], doneTag)[0]!;
    expect(refreshed.effort).toBe(3);
    expect(refreshed.effortUnit).toBe("hours");
    expect(formatEffortTotals(getEffectiveEffortTotals(refreshed, doneTag))).toBe("3h");
  });

  it("rollupDisplayTotals avoids double-counting calculated parent", () => {
    const child = node({ id: "c", title: "C", effort: 2, effortUnit: "hours" });
    const parent = node(
      { id: "p", title: "P", effortSource: "calculated", effort: 2, effortUnit: "hours" },
      [child],
    );
    const refreshed = refreshCalculatedEffortsInTree([parent], doneTag)[0]!;
    expect(formatEffortTotals(rollupDisplayTotals(refreshed, doneTag))).toBe("2h");
    expect(formatEffortTotals(aggregateEffortTotals(refreshed))).toBe("4h");
  });

  it("calculateEffortFieldsFromChildren picks dominant unit", () => {
    const tree = node(
      { id: "p", title: "P" },
      [node({ id: "c", title: "C", effort: 1, effortUnit: "workdays" })],
    );
    expect(calculateEffortFieldsFromChildren(tree, doneTag)).toEqual({
      effort: 1,
      effortUnit: "workdays",
    });
  });
});
