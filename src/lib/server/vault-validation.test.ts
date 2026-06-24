import { describe, expect, it } from "vitest";

import { defaultLoxIdService } from "@/lib/lox-id";
import { normalizeVaultLoxId } from "@/lib/server/vault-validation";

describe("vault-validation", () => {
  it("accepts BRD-prefixed board lox ids", () => {
    const id = defaultLoxIdService.generateId("BRD");
    expect(normalizeVaultLoxId(id)).toBe(id);
    expect(normalizeVaultLoxId(id.toLowerCase())).toBe(id);
  });

  it("rejects invalid ids", () => {
    expect(normalizeVaultLoxId("BRD-INVALID")).toBeNull();
    expect(normalizeVaultLoxId("")).toBeNull();
  });
});
