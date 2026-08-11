import { describe, expect, it } from "vitest";

import {
  collectColorsFromForest,
  collectScheduleKindsFromForest,
  defaultColorForNewCard,
  nodeMatchesBoardFilters,
  nodeMatchesAnyScheduleFilter,
  parseFilterColors,
  parseScheduleFilterKinds,
} from "@/lib/board-filters";
import type { TaskNode } from "@/types/task-node";

function node(
  id: string,
  opts: Partial<Pick<TaskNode, "tags" | "dueDate" | "reminderDate" | "cardColor" | "children">> = {},
): TaskNode {
  return {
    id,
    title: id,
    link: "",
    description: "",
    tags: opts.tags ?? [],
    dueDate: opts.dueDate ?? null,
    reminderDate: opts.reminderDate ?? null,
    effort: 0,
    ...(opts.cardColor ? { cardColor: opts.cardColor } : {}),
    children: opts.children ?? [],
  };
}

describe("board-filters", () => {
  it("parst Farben und Terminarten", () => {
    expect(parseFilterColors(["sky", "nope", "sky", "rose"])).toEqual(["sky", "rose"]);
    expect(parseScheduleFilterKinds(["due", "x", "reminder", "due"])).toEqual(["due", "reminder"]);
  });

  it("sammelt Farben und Terminarten aus dem Wald", () => {
    const roots = [
      node("a", {
        cardColor: "emerald",
        dueDate: new Date("2026-01-01"),
        children: [node("b", { cardColor: "sky", reminderDate: new Date("2026-02-01") })],
      }),
    ];
    expect(collectColorsFromForest(roots)).toEqual(["sky", "emerald"]);
    expect(collectScheduleKindsFromForest(roots)).toEqual(["due", "reminder"]);
  });

  it("matcht Terminfilter (Hilfsfunktion: eines reicht)", () => {
    const withDue = node("a", { dueDate: new Date("2026-01-01") });
    const withReminder = node("b", { reminderDate: new Date("2026-01-01") });
    expect(nodeMatchesAnyScheduleFilter(withDue, ["due"])).toBe(true);
    expect(nodeMatchesAnyScheduleFilter(withDue, ["reminder"])).toBe(false);
    expect(nodeMatchesAnyScheduleFilter(withReminder, ["due", "reminder"])).toBe(true);
  });

  it("AND: alle Kriterien müssen erfüllt sein", () => {
    const n = node("a", {
      tags: ["x", "y"],
      cardColor: "sky",
      dueDate: new Date("2026-01-01"),
    });
    expect(
      nodeMatchesBoardFilters(n, {
        filterTags: ["x", "y"],
        filterColors: ["sky"],
        filterScheduleKinds: ["due"],
        filterCombineMode: "and",
      }),
    ).toBe(true);
    expect(
      nodeMatchesBoardFilters(n, {
        filterTags: ["x", "z"],
        filterColors: [],
        filterScheduleKinds: [],
        filterCombineMode: "and",
      }),
    ).toBe(false);
    expect(
      nodeMatchesBoardFilters(n, {
        filterTags: ["x"],
        filterColors: ["rose"],
        filterScheduleKinds: [],
        filterCombineMode: "and",
      }),
    ).toBe(false);
  });

  it("Exclude-Tags (NOT) schließen Karten aus", () => {
    const n = node("a", { tags: ["x", "y"] });
    expect(
      nodeMatchesBoardFilters(n, {
        filterTags: [],
        filterExcludeTags: ["y"],
        filterColors: [],
        filterScheduleKinds: [],
      }),
    ).toBe(false);
    expect(
      nodeMatchesBoardFilters(n, {
        filterTags: ["x"],
        filterExcludeTags: ["z"],
        filterColors: [],
        filterScheduleKinds: [],
      }),
    ).toBe(true);
    expect(
      nodeMatchesBoardFilters(n, {
        filterTags: ["x"],
        filterExcludeTags: ["y"],
        filterColors: [],
        filterScheduleKinds: [],
      }),
    ).toBe(false);
  });

  it("OR: ein erfülltes Kriterium reicht", () => {
    const n = node("a", { tags: ["x"], cardColor: "sky" });
    expect(
      nodeMatchesBoardFilters(n, {
        filterTags: ["x"],
        filterColors: ["rose"],
        filterScheduleKinds: [],
        filterCombineMode: "or",
      }),
    ).toBe(true);
    expect(
      nodeMatchesBoardFilters(n, {
        filterTags: ["y", "z"],
        filterColors: ["rose"],
        filterScheduleKinds: ["due"],
        filterCombineMode: "or",
      }),
    ).toBe(false);
    expect(
      nodeMatchesBoardFilters(n, {
        filterTags: ["y"],
        filterColors: ["sky"],
        filterScheduleKinds: [],
        filterCombineMode: "or",
      }),
    ).toBe(true);
    expect(
      nodeMatchesBoardFilters(n, {
        filterTags: ["x", "z"],
        filterColors: [],
        filterScheduleKinds: [],
        filterCombineMode: "or",
      }),
    ).toBe(true);
  });

  it("Exclude gilt auch im ODER-Modus hart", () => {
    const n = node("a", { tags: ["x", "blocked"], cardColor: "sky" });
    expect(
      nodeMatchesBoardFilters(n, {
        filterTags: ["x"],
        filterExcludeTags: ["blocked"],
        filterColors: ["sky"],
        filterScheduleKinds: [],
        filterCombineMode: "or",
      }),
    ).toBe(false);
  });

  it("übernimmt Farbe nur bei genau einem Farbfilter", () => {
    expect(defaultColorForNewCard(["sky"])).toBe("sky");
    expect(defaultColorForNewCard(["sky", "rose"])).toBeUndefined();
    expect(defaultColorForNewCard([])).toBeUndefined();
  });

  it("Notizen matchen keine Board-Filter", () => {
    const note: TaskNode = {
      id: "n",
      title: "N",
      kind: "note",
      markdown: "x",
      link: "",
      description: "",
      tags: ["x"],
      dueDate: new Date("2026-01-01"),
      reminderDate: null,
      effort: 0,
      cardColor: "sky",
      children: [],
    };
    expect(
      nodeMatchesBoardFilters(note, {
        filterTags: ["x"],
        filterColors: [],
        filterScheduleKinds: [],
      }),
    ).toBe(false);
  });
});
