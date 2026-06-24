import { describe, expect, it } from "vitest";

import { isUsableVaultEtag } from "./server-board";

describe("isUsableVaultEtag", () => {
  it("rejects null and empty quoted etag", () => {
    expect(isUsableVaultEtag(null)).toBe(false);
    expect(isUsableVaultEtag('""')).toBe(false);
    expect(isUsableVaultEtag("")).toBe(false);
  });

  it("accepts real etag", () => {
    expect(isUsableVaultEtag('"abc123"')).toBe(true);
  });
});
