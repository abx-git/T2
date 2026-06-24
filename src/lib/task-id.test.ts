import { describe, expect, it } from "vitest";

import { defaultLoxIdService } from "@/lib/lox-id";
import { formatTaskIdForDisplay, formatVaultLoxIdForDisplay } from "@/lib/task-id";

describe("formatVaultLoxIdForDisplay", () => {
  it("preserves BRD prefix for board vault ids", () => {
    const id = defaultLoxIdService.generateId("BRD");
    expect(formatVaultLoxIdForDisplay(id)).toBe(id);
    expect(formatTaskIdForDisplay(id)).not.toBe(id);
  });
});
