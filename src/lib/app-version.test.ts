import { describe, expect, it } from "vitest";

import { APP_VERSION, formatAppVersionLabel } from "./app-version";

describe("app-version", () => {
  it("reads version from package.json", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("formats version label", () => {
    expect(formatAppVersionLabel("1.2.3")).toBe("Version 1.2.3");
  });
});
