import { describe, expect, it } from "vitest";

import {
  fromInputDateTimeLocal,
  isDateOnlyDue,
  toInputDateTimeLocal,
} from "@/lib/task-datetime";

describe("isDateOnlyDue", () => {
  it("treats midnight and noon as date-only", () => {
    expect(isDateOnlyDue(new Date(2026, 4, 20, 0, 0, 0, 0))).toBe(true);
    expect(isDateOnlyDue(new Date(2026, 4, 20, 12, 0, 0, 0))).toBe(true);
    expect(isDateOnlyDue(new Date(2026, 4, 20, 14, 30, 0, 0))).toBe(false);
  });
});

describe("datetime-local roundtrip", () => {
  it("roundtrips timed values", () => {
    const raw = "2026-05-20T15:45";
    const d = fromInputDateTimeLocal(raw)!;
    expect(d.getHours()).toBe(15);
    expect(d.getMinutes()).toBe(45);
    expect(toInputDateTimeLocal(d)).toBe(raw);
  });

  it("roundtrips date-only via midnight input", () => {
    const d = fromInputDateTimeLocal("2026-05-20T00:00")!;
    expect(isDateOnlyDue(d)).toBe(true);
    expect(toInputDateTimeLocal(d)).toBe("2026-05-20T00:00");
  });
});
