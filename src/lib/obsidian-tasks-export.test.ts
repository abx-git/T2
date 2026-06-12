import { describe, expect, it } from "vitest";

import {
  formatObsidianTaskTitle,
  formatObsidianTasksDate,
  tagToObsidianHashtag,
  taskSubtreeToObsidianTasksMarkdown,
} from "@/lib/obsidian-tasks-export";
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

describe("formatObsidianTasksDate", () => {
  it("formats date-only without time", () => {
    expect(formatObsidianTasksDate(new Date(2026, 4, 18, 0, 0, 0, 0))).toBe("2026-05-18");
    expect(formatObsidianTasksDate(new Date(2026, 4, 18, 12, 0, 0, 0))).toBe("2026-05-18");
  });

  it("formats datetime with hours and minutes", () => {
    expect(formatObsidianTasksDate(new Date(2026, 4, 18, 23, 34, 0, 0))).toBe("2026-05-18 23:34");
  });
});

describe("tagToObsidianHashtag", () => {
  it("normalizes spaces and strips leading hash", () => {
    expect(tagToObsidianHashtag("Meilenstein")).toBe("#Meilenstein");
    expect(tagToObsidianHashtag("#Erledigt")).toBe("#Erledigt");
    expect(tagToObsidianHashtag("foo bar")).toBe("#foo-bar");
  });
});

describe("taskSubtreeToObsidianTasksMarkdown", () => {
  it("exports nested checklist with indentation tabs", () => {
    const root = node(
      { id: "p", title: "Parent", effort: 1, effortUnit: "hours" },
      [node({ id: "c", title: "Child", effort: 30, effortUnit: "minutes" })],
    );
    const md = taskSubtreeToObsidianTasksMarkdown(root, { completedTag: DEFAULT_COMPLETED_TAG });
    expect(md).toContain("- [ ] Parent");
    expect(md).toContain("⏱️ 1h");
    expect(md).toContain("\t- [ ] Child");
    expect(md).toContain("⏱️ 30min");
  });

  it("includes due, reminder, done checkbox and tags", () => {
    const due = new Date(2026, 4, 20, 18, 0, 0, 0);
    const rem = new Date(2026, 4, 19, 9, 0, 0, 0);
    const root = node({
      id: "t",
      title: "Gutscheine",
      tags: ["Backoffice", DEFAULT_COMPLETED_TAG],
      dueDate: due,
      reminderDate: rem,
    });
    const md = taskSubtreeToObsidianTasksMarkdown(root, { completedTag: DEFAULT_COMPLETED_TAG });
    expect(md).toContain("- [x] Gutscheine");
    expect(md).toContain("#Backoffice");
    expect(md).toContain("⏳ 2026-05-19 09:00");
    expect(md).toContain("✅ 2026-05-20 18:00");
    expect(md).not.toContain("📅");
  });

  it("combines title and link as markdown link", () => {
    expect(
      formatObsidianTaskTitle({ title: "Dokumentation", link: "https://example.org/docs" }),
    ).toBe("[Dokumentation](https://example.org/docs)");
    const root = node({
      id: "l",
      title: "Wiki",
      link: "https://wiki.example.com/page",
    });
    const md = taskSubtreeToObsidianTasksMarkdown(root, { completedTag: DEFAULT_COMPLETED_TAG });
    expect(md).toContain("- [ ] [Wiki](https://wiki.example.com/page)");
  });

  it("exports plain title when link is empty or invalid", () => {
    expect(formatObsidianTaskTitle({ title: "Ohne", link: "" })).toBe("Ohne");
    expect(formatObsidianTaskTitle({ title: "", link: "javascript:alert(1)" })).toBe("(Ohne Titel)");
  });

  it("emits description as blockquote under the task", () => {
    const root = node(
      { id: "p", title: "P", description: "Zeile 1\nZeile 2" },
      [node({ id: "c", title: "C", description: "Kind-Info" })],
    );
    const md = taskSubtreeToObsidianTasksMarkdown(root, { completedTag: DEFAULT_COMPLETED_TAG });
    expect(md).toContain("> Zeile 1");
    expect(md).toContain("> Zeile 2");
    expect(md).toContain("\t> Kind-Info");
  });
});
