import { describe, expect, it } from "vitest";

import {
  aggregateOverdueDue,
  getNextChildMilestonePreview,
  isDueOverdue,
  startOfLocalDay,
} from "@/lib/aggregates";
import { DONE_TAG_DISPLAY, MILESTONE_TAG_DISPLAY } from "@/lib/task-tags";
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

describe("isDueOverdue", () => {
  it("treats due before today as overdue", () => {
    const yesterday = new Date(startOfLocalDay());
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isDueOverdue(yesterday, false)).toBe(true);
  });

  it("does not treat today as overdue", () => {
    expect(isDueOverdue(startOfLocalDay(), false)).toBe(false);
  });

  it("uses exact time for timed due dates", () => {
    const inOneHour = new Date(Date.now() + 60 * 60 * 1000);
    expect(isDueOverdue(inOneHour, false)).toBe(false);
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    expect(isDueOverdue(oneMinuteAgo, false)).toBe(true);
  });

  it("ignores done tasks", () => {
    const yesterday = new Date(startOfLocalDay());
    yesterday.setDate(yesterday.getDate() - 2);
    expect(isDueOverdue(yesterday, true)).toBe(false);
  });
});

describe("aggregateOverdueDue", () => {
  it("returns earliest overdue date in subtree", () => {
    const early = new Date(2020, 0, 1);
    const late = new Date(2020, 5, 1);
    const tree = node(
      { id: "p", title: "P" },
      [
        node({ id: "a", title: "A", dueDate: late }),
        node({ id: "b", title: "B", dueDate: early }),
      ],
    );
    expect(aggregateOverdueDue(tree)?.getTime()).toBe(early.getTime());
  });

  it("propagates child overdue to parent view", () => {
    const overdue = new Date(2019, 11, 31);
    const tree = node({ id: "p", title: "P" }, [node({ id: "c", title: "C", dueDate: overdue })]);
    expect(aggregateOverdueDue(tree)?.getTime()).toBe(overdue.getTime());
  });
});

describe("getNextChildMilestonePreview", () => {
  it("sums effort of non-done siblings before first milestone", () => {
    const tree = node(
      { id: "p", title: "P" },
      [
        node({ id: "a", title: "A", effort: 2 }, [node({ id: "a1", title: "A1", effort: 3 })]),
        node({ id: "b", title: "B", effort: 1, tags: [DONE_TAG_DISPLAY] }),
        node({ id: "m", title: "M", tags: [MILESTONE_TAG_DISPLAY] }),
        node({ id: "c", title: "C", effort: 99 }),
      ],
    );
    const preview = getNextChildMilestonePreview(tree);
    expect(preview?.milestone.id).toBe("m");
    expect(preview?.effortBeforeMilestone.minutes).toBe(300);
  });
});
