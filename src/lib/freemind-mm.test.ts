/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";

import { parseFreemindMmToRoots, taskRootsToFreemindMm } from "./freemind-mm";
import type { TaskNode } from "@/types/task-node";

describe("freemind-mm", () => {
  it("parses simple map and preserves titles", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<map version="1.0.1">
  <node TEXT="Root">
    <node TEXT="A"/>
    <node TEXT="B"/>
  </node>
</map>`;
    const roots = parseFreemindMmToRoots(xml);
    expect(roots).toHaveLength(1);
    expect(roots[0]!.title).toBe("Root");
    expect(roots[0]!.children.map((c) => c.title)).toEqual(["A", "B"]);
  });

  it("roundtrips single-root board", () => {
    const roots: TaskNode[] = [
      {
        id: "id-1",
        title: "Projekt",
        link: "https://example.org/p",
        description: "Hinweis",
        tags: ["Demo"],
        dueDate: null,
        reminderDate: null,
        effort: 3,
        children: [
          {
            id: "id-2",
            title: "Teil",
            link: "",
            description: "",
            tags: [],
            dueDate: null,
            reminderDate: null,
            effort: 0,
            children: [],
          },
        ],
      },
    ];
    const xml = taskRootsToFreemindMm(roots);
    const back = parseFreemindMmToRoots(xml);
    expect(back).toHaveLength(1);
    expect(back[0]!.title).toBe("Projekt");
    expect(back[0]!.description).toContain("Hinweis");
    expect(back[0]!.tags).toContain("Demo");
    expect(back[0]!.effort).toBe(3);
    expect(back[0]!.link).toBe("https://example.org/p");
    expect(back[0]!.children[0]!.title).toBe("Teil");
  });

  it("unwraps multi-root export wrapper", () => {
    const roots: TaskNode[] = [
      {
        id: "a",
        title: "R1",
        link: "",
        description: "",
        tags: [],
        dueDate: null,
        reminderDate: null,
        effort: 0,
        children: [],
      },
      {
        id: "b",
        title: "R2",
        link: "",
        description: "",
        tags: [],
        dueDate: null,
        reminderDate: null,
        effort: 0,
        children: [],
      },
    ];
    const xml = taskRootsToFreemindMm(roots);
    const back = parseFreemindMmToRoots(xml);
    expect(back).toHaveLength(2);
    expect(back.map((r) => r.title)).toEqual(["R1", "R2"]);
  });
});
