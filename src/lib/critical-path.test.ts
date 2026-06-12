import { describe, expect, it } from "vitest";

import {
  addWorkdays,
  criticalPathTotals,
  formatCriticalPathHint,
  projectCriticalPathEnd,
} from "@/lib/critical-path";
import { DEFAULT_COMPLETED_TAG, DONE_TAG_DISPLAY } from "@/lib/task-tags";
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

describe("addWorkdays", () => {
  it("skips Saturday and Sunday", () => {
    const fri = new Date(2026, 4, 15, 12, 0, 0, 0);
    const end = addWorkdays(fri, 1);
    expect(end.getDay()).toBe(1);
    expect(end.getDate()).toBe(18);
    expect(end.getHours()).toBe(12);
  });
});

describe("criticalPathTotals", () => {
  it("picks longest child branch", () => {
    const tree = node(
      { id: "p", title: "P", effort: 1, effortUnit: "hours" },
      [
        node({ id: "a", title: "A", effort: 1, effortUnit: "hours" }),
        node({ id: "b", title: "B", effort: 3, effortUnit: "workdays" }),
      ],
    );
    const cp = criticalPathTotals(tree, DEFAULT_COMPLETED_TAG);
    expect(cp.workdays).toBe(3);
    expect(cp.minutes).toBe(60);
  });

  it("ignores done branches", () => {
    const tree = node(
      { id: "p", title: "P", effort: 1, effortUnit: "hours" },
      [
        node({ id: "done", title: "D", effort: 40, effortUnit: "hours", tags: [DONE_TAG_DISPLAY] }),
        node({ id: "open", title: "O", effort: 0.5, effortUnit: "hours" }),
      ],
    );
    const cp = criticalPathTotals(tree, DEFAULT_COMPLETED_TAG);
    expect(cp.minutes).toBe(90);
  });
});

describe("formatCriticalPathHint", () => {
  it("uses deadline with duration totals instead of projecting from now", () => {
    const deadline = new Date(2026, 4, 23, 6, 25, 0, 0);
    const hint = formatCriticalPathHint(
      { minutes: 30, workdays: 0 },
      {
        deadline,
        durationTotals: { minutes: 155, workdays: 0 },
      },
    );
    expect(hint).toContain("KP 2h 35min");
    expect(hint).toContain("23.05.2026");
    expect(hint).toContain("06:25");
    expect(hint).not.toContain("18.05");
  });

  it("without deadline returns duration only, no projected end date", () => {
    const hint = formatCriticalPathHint({ minutes: 60, workdays: 0 });
    expect(hint).toBe("KP 1h");
    expect(hint).not.toContain("→");
  });
});

describe("projectCriticalPathEnd", () => {
  it("applies workdays before minutes", () => {
    const start = new Date(2026, 4, 15, 9, 0, 0, 0); // Freitag 9:00
    const end = projectCriticalPathEnd(start, { workdays: 1, minutes: 60 });
    expect(end.getDay()).toBe(1);
    expect(end.getHours()).toBe(10);
  });
});
