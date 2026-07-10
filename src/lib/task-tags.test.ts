import { describe, expect, it } from "vitest";

import {
  collectAllTagsFromForest,
  countTagUsagesInForest,
  defaultTagsForNewCard,
  isTaskMarkedDone,
  renameTagInForest,
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
});

describe("tagsWithoutCompletedTag", () => {
  it("strips done label", () => {
    expect(tagsWithoutCompletedTag(["x", "Fertig", "y"], "fertig")).toEqual(["x", "y"]);
  });
});

describe("countTagUsagesInForest", () => {
  it("counts cards with matching tag", () => {
    const roots = [n(["A"]), n(["a", "B"], [n(["A"])])];
    expect(countTagUsagesInForest(roots, "a")).toBe(3);
    expect(countTagUsagesInForest(roots, "C")).toBe(0);
  });
});

describe("renameTagInForest", () => {
  it("replaces tag on all cards case-insensitively", () => {
    const roots = [
      n(["Alt", "x"]),
      n(["alt"], [n(["ALT", "y"])]),
    ];
    const next = renameTagInForest(roots, "alt", "Neu");
    expect(next[0].tags).toEqual(["Neu", "x"]);
    expect(next[1].tags).toEqual(["Neu"]);
    expect(next[1].children[0].tags).toEqual(["Neu", "y"]);
  });

  it("merges when target tag already exists on card", () => {
    const roots = [n(["Alt", "Neu"])];
    const next = renameTagInForest(roots, "alt", "Neu");
    expect(next[0].tags).toEqual(["Neu"]);
  });
});

describe("defaultTagsForNewCard", () => {
  it("übernimmt aktive Filter-Tags", () => {
    expect(defaultTagsForNewCard(["Projekt A", "Dringend"])).toEqual(["Projekt A", "Dringend"]);
  });

  it("liefert leere Tags ohne Filter", () => {
    expect(defaultTagsForNewCard([])).toEqual([]);
  });
});
