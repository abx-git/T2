import { describe, expect, it } from "vitest";

import {
  collectAppointmentsFromForest,
  formatAppointmentsMarkdown,
} from "@/lib/appointments-export";
import { DEFAULT_COMPLETED_TAG } from "@/lib/task-tags";
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

describe("collectAppointmentsFromForest", () => {
  it("collects due and reminder sorted by date", () => {
    const due = new Date(2026, 4, 20, 18, 0, 0, 0);
    const rem = new Date(2026, 4, 19, 9, 0, 0, 0);
    const roots = [
      node({
        id: "a",
        title: "Alpha",
        dueDate: due,
        reminderDate: rem,
      }),
    ];
    const entries = collectAppointmentsFromForest(roots, { completedTag: DEFAULT_COMPLETED_TAG });
    expect(entries).toHaveLength(2);
    expect(entries[0]!.kind).toBe("reminder");
    expect(entries[1]!.kind).toBe("due");
  });

  it("excludes done when includeDone is false", () => {
    const roots = [
      node({
        id: "d",
        title: "Done",
        tags: [DEFAULT_COMPLETED_TAG],
        dueDate: new Date(2026, 4, 1),
      }),
    ];
    expect(
      collectAppointmentsFromForest(roots, {
        completedTag: DEFAULT_COMPLETED_TAG,
        includeDone: false,
      }),
    ).toHaveLength(0);
  });
});

describe("formatAppointmentsMarkdown", () => {
  it("plain markdown without obsidian emojis", () => {
    const md = formatAppointmentsMarkdown(
      [node({ id: "t", title: "Task", dueDate: new Date(2026, 4, 18, 23, 34, 0, 0) })],
      { style: "plain", completedTag: DEFAULT_COMPLETED_TAG },
    );
    expect(md).toContain("# Termine");
    expect(md).toContain("Fällig");
    expect(md).not.toContain("📅");
  });

  it("obsidian tasks syntax", () => {
    const md = formatAppointmentsMarkdown(
      [node({ id: "t", title: "Task", dueDate: new Date(2026, 4, 18, 12, 0, 0, 0) })],
      { style: "obsidian", completedTag: DEFAULT_COMPLETED_TAG },
    );
    expect(md).toContain("- [ ] Task");
    expect(md).toContain("📅 2026-05-18");
  });

  it("includes notes as indented blockquote", () => {
    const md = formatAppointmentsMarkdown(
      [
        node({
          id: "t",
          title: "Task",
          description: "Notiztext",
          dueDate: new Date(2026, 4, 18, 12, 0, 0, 0),
        }),
      ],
      { style: "plain", completedTag: DEFAULT_COMPLETED_TAG },
    );
    expect(md).toContain("\t> Notiztext");
  });
});
