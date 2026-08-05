import { describe, expect, it } from "vitest";

import { getTaskCommand, normalizeTaskCommand } from "./task-command";

describe("task-command", () => {
  it("trimmt und normalisiert Zeilenumbrüche", () => {
    expect(normalizeTaskCommand("  npm run build  ")).toBe("npm run build");
    expect(normalizeTaskCommand("git status\r\n")).toBe("git status");
  });

  it("liefert null für leere Eingaben", () => {
    expect(getTaskCommand("")).toBeNull();
    expect(getTaskCommand("   ")).toBeNull();
    expect(getTaskCommand(undefined)).toBeNull();
  });

  it("behält mehrzeilige Befehle", () => {
    expect(getTaskCommand("echo a\necho b")).toBe("echo a\necho b");
  });
});
