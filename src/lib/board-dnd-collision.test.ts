import { describe, expect, it } from "vitest";

import {
  boundingRectOf,
  pointInClientRect,
  pointerOverOutlineZone,
} from "@/lib/board-dnd-collision";

describe("board-dnd-collision zones", () => {
  it("pointInClientRect includes edges", () => {
    const rect = { left: 10, top: 20, width: 100, height: 50 };
    expect(pointInClientRect({ x: 10, y: 20 }, rect)).toBe(true);
    expect(pointInClientRect({ x: 110, y: 70 }, rect)).toBe(true);
    expect(pointInClientRect({ x: 111, y: 40 }, rect)).toBe(false);
    expect(pointInClientRect({ x: 50, y: 19 }, rect)).toBe(false);
  });

  it("boundingRectOf unions outline droppable rects", () => {
    expect(
      boundingRectOf([
        { left: 0, top: 0, width: 200, height: 40 },
        { left: 8, top: 40, width: 180, height: 40 },
      ]),
    ).toEqual({ left: 0, top: 0, width: 200, height: 80 });
  });

  it("pointerOverOutlineZone is false for work-area coordinates", () => {
    const outlineRects = [
      { left: 0, top: 80, width: 256, height: 32 },
      { left: 0, top: 112, width: 256, height: 32 },
    ];
    expect(pointerOverOutlineZone({ x: 120, y: 100 }, outlineRects)).toBe(true);
    // Arbeitsbereich rechts neben der Outline
    expect(pointerOverOutlineZone({ x: 400, y: 100 }, outlineRects)).toBe(false);
    // Leerer Bereich ohne Outline-Rects
    expect(pointerOverOutlineZone({ x: 120, y: 100 }, [])).toBe(false);
  });
});
