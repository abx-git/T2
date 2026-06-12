import { describe, expect, it } from "vitest";

import { isFetchNetworkError } from "./server-board-network";

describe("isFetchNetworkError", () => {
  it("treats TypeError as network failure", () => {
    expect(isFetchNetworkError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("does not treat HTTP errors as network failure", () => {
    expect(isFetchNetworkError(new Error("precondition_failed"))).toBe(false);
  });
});
