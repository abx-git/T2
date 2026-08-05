import { describe, expect, it } from "vitest";

import {
  DEFAULT_NOTE_ACCENT,
  noteAccentClasses,
  parseNoteAccent,
} from "@/lib/note-accent";

describe("note-accent", () => {
  it("defaults to steel (dunkles Blaugrau)", () => {
    expect(DEFAULT_NOTE_ACCENT).toBe("steel");
    expect(parseNoteAccent(undefined)).toBe("steel");
    expect(parseNoteAccent("nope")).toBe("steel");
    expect(noteAccentClasses("steel").label).toBe("Blaugrau");
  });

  it("parses known accents", () => {
    expect(parseNoteAccent("violet")).toBe("violet");
    expect(noteAccentClasses("sky").icon).toContain("sky");
  });
});
