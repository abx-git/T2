import { describe, expect, it } from "vitest";

import {
  collectAllTagsFromForest,
  isTaskMarkedDone,
  setCompletedTagOnTags,
  tagsAvailableForFilter,
  tagsWithoutCompletedTag,
} from "@/lib/task-tags";
import type { TaskNode } from "@/types/task-node";

function n(tags: string[], children: TaskNode[] = []): TaskNode {
  return {
    id: "x",
    title: "",
    link: "",
    description: "",
    tags,
    dueDate: null,
    reminderDate: null,
    effort: 0,
    children,
  };
}

describe("collectAllTagsFromForest", () => {
  it("dedupes case-insensitively and sorts", () => {
    const roots = [
      n(["Alpha", "beta"]),
      n(["BETA"], [n(["gamma"])]),
    ];
    expect(collectAllTagsFromForest(roots)).toEqual(["Alpha", "beta", "gamma"]);
  });
});

describe("tagsAvailableForFilter", () => {
  it("excludes selected tags", () => {
    const all = ["A", "B", "C"];
    expect(tagsAvailableForFilter(all, ["b"])).toEqual(["A", "C"]);
  });
});

describe("isTaskMarkedDone", () => {
  it("uses configured completed tag", () => {
    expect(isTaskMarkedDone({ tags: ["fertig"] }, "Fertig")).toBe(true);
    expect(isTaskMarkedDone({ tags: ["Erledigt"] }, "Fertig")).toBe(false);
  });
});

describe("setCompletedTagOnTags", () => {
  it("adds canonical completed tag and removes variants", () => {
    expect(setCompletedTagOnTags(["A", "erledigt"], "Erledigt", true)).toEqual(["A", "Erledigt"]);
    expect(setCompletedTagOnTags(["A", "Erledigt"], "Erledigt", false)).toEqual(["A"]);
  });

  it("tagsWithoutCompletedTag strips done label", () => {
    expect(tagsWithoutCompletedTag(["x", "Fertig", "y"], "fertig")).toEqual(["x", "y"]);
  });
});
