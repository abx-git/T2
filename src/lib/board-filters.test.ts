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

  it("matcht Terminfilter OR", () => {
    const withDue = node("a", { dueDate: new Date("2026-01-01") });
    const withReminder = node("b", { reminderDate: new Date("2026-01-01") });
    expect(nodeMatchesAnyScheduleFilter(withDue, ["due"])).toBe(true);
    expect(nodeMatchesAnyScheduleFilter(withDue, ["reminder"])).toBe(false);
    expect(nodeMatchesAnyScheduleFilter(withReminder, ["due", "reminder"])).toBe(true);
  });

  it("kombiniert Dimensionen mit AND", () => {
    const n = node("a", { tags: ["x"], cardColor: "sky", dueDate: new Date("2026-01-01") });
    expect(
      nodeMatchesBoardFilters(n, {
        filterTags: ["x"],
        filterColors: ["sky"],
        filterScheduleKinds: ["due"],
      }),
    ).toBe(true);
    expect(
      nodeMatchesBoardFilters(n, {
        filterTags: ["x"],
        filterColors: ["rose"],
        filterScheduleKinds: ["due"],
      }),
    ).toBe(false);
  });

  it("kombiniert Dimensionen mit OR", () => {
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
        filterTags: ["y"],
        filterColors: ["rose"],
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
});
