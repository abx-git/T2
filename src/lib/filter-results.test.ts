import { describe, expect, it } from "vitest";

import {
  collectFilterMatchingCards,
  formatFilterResultsMarkdown,
  hasActiveFacetFilters,
} from "@/lib/filter-results";
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

describe("hasActiveFacetFilters", () => {
  it("is false when empty", () => {
    expect(
      hasActiveFacetFilters({
        filterTags: [],
        filterColors: [],
        filterScheduleKinds: [],
      }),
    ).toBe(false);
  });

  it("is true when any dimension set", () => {
    expect(
      hasActiveFacetFilters({
        filterTags: ["x"],
        filterColors: [],
        filterScheduleKinds: [],
      }),
    ).toBe(true);
  });
});

describe("collectFilterMatchingCards", () => {
  const roots = [
    node({ id: "a", title: "Alpha", tags: ["work"], cardColor: "sky" }, [
      node({
        id: "a1",
        title: "Child",
        tags: ["work"],
        dueDate: new Date(2026, 4, 20),
      }),
    ]),
    node({
      id: "b",
      title: "Beta",
      tags: ["home"],
      cardColor: "rose",
      reminderDate: new Date(2026, 4, 19),
    }),
    node({
      id: "c",
      title: "Done",
      tags: ["work", DEFAULT_COMPLETED_TAG],
      dueDate: new Date(2026, 4, 1),
    }),
  ];

  it("AND: Tag und Farbe müssen beide passen", () => {
    const cards = collectFilterMatchingCards(roots, {
      filterTags: ["work"],
      filterColors: ["sky"],
      filterScheduleKinds: [],
      completedTag: DEFAULT_COMPLETED_TAG,
    });
    expect(cards.map((c) => c.nodeId)).toEqual(["a"]);
  });

  it("OR: Tag oder Farbe reicht", () => {
    const cards = collectFilterMatchingCards(roots, {
      filterTags: ["work"],
      filterColors: ["emerald"],
      filterScheduleKinds: [],
      filterCombineMode: "or",
      completedTag: DEFAULT_COMPLETED_TAG,
    });
    expect(cards.map((c) => c.nodeId).sort()).toEqual(["a", "a1", "c"]);
  });

  it("AND: mehrere Tags müssen alle vorhanden sein", () => {
    const multi = [
      node({ id: "m1", title: "Both", tags: ["work", "home"] }),
      node({ id: "m2", title: "Work only", tags: ["work"] }),
    ];
    const cards = collectFilterMatchingCards(multi, {
      filterTags: ["work", "home"],
      filterColors: [],
      filterScheduleKinds: [],
      filterCombineMode: "and",
      completedTag: DEFAULT_COMPLETED_TAG,
    });
    expect(cards.map((c) => c.nodeId)).toEqual(["m1"]);
  });

  it("matches schedule kind", () => {
    const cards = collectFilterMatchingCards(roots, {
      filterTags: [],
      filterColors: [],
      filterScheduleKinds: ["reminder"],
      completedTag: DEFAULT_COMPLETED_TAG,
    });
    expect(cards.map((c) => c.nodeId)).toEqual(["b"]);
  });

  it("excludes done when includeDone is false", () => {
    const cards = collectFilterMatchingCards(roots, {
      filterTags: ["work"],
      filterColors: [],
      filterScheduleKinds: [],
      completedTag: DEFAULT_COMPLETED_TAG,
      includeDone: false,
    });
    expect(cards.map((c) => c.nodeId).sort()).toEqual(["a", "a1"]);
  });

  it("includes pathTitles", () => {
    const cards = collectFilterMatchingCards(roots, {
      filterTags: [],
      filterColors: [],
      filterScheduleKinds: ["due"],
      completedTag: DEFAULT_COMPLETED_TAG,
      includeDone: false,
    });
    const child = cards.find((c) => c.nodeId === "a1");
    expect(child?.pathTitles).toEqual(["Alpha", "Child"]);
  });
});

describe("formatFilterResultsMarkdown", () => {
  it("plain export contains title and filter summary", () => {
    const md = formatFilterResultsMarkdown(
      [node({ id: "t", title: "Task", tags: ["x"] })],
      {
        style: "plain",
        filterTags: ["x"],
        filterColors: [],
        filterScheduleKinds: [],
        completedTag: DEFAULT_COMPLETED_TAG,
      },
    );
    expect(md).toContain("# Treffer");
    expect(md).toContain("Tags: x");
    expect(md).toContain("**Task**");
  });

  it("includes notes as indented blockquote", () => {
    const md = formatFilterResultsMarkdown(
      [node({ id: "t", title: "Task", tags: ["x"], description: "Wichtig\nZweite Zeile" })],
      {
        style: "plain",
        filterTags: ["x"],
        filterColors: [],
        filterScheduleKinds: [],
        completedTag: DEFAULT_COMPLETED_TAG,
      },
    );
    expect(md).toContain("\t> Wichtig");
    expect(md).toContain("\t> Zweite Zeile");
  });

  it("checklist export uses checkboxes", () => {
    const md = formatFilterResultsMarkdown(
      [node({ id: "t", title: "Task", tags: ["x"] })],
      {
        style: "checklist",
        filterTags: ["x"],
        filterColors: [],
        filterScheduleKinds: [],
        completedTag: DEFAULT_COMPLETED_TAG,
      },
    );
    expect(md).toContain("- [ ] Task");
  });
});
