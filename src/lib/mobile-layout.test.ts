import { describe, expect, it, vi, afterEach } from "vitest";

import {
  getMobileLayoutSnapshot,
  MOBILE_LAYOUT_MEDIA_QUERY,
} from "@/lib/mobile-layout";

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal("window", {
    matchMedia: (query: string) => ({
      matches: matches && query === MOBILE_LAYOUT_MEDIA_QUERY,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

describe("mobile-layout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the md breakpoint media query", () => {
    expect(MOBILE_LAYOUT_MEDIA_QUERY).toBe("(max-width: 767px)");
  });

  it("reports mobile when matchMedia matches", () => {
    stubMatchMedia(true);
    expect(getMobileLayoutSnapshot()).toBe(true);
  });

  it("reports desktop when matchMedia does not match", () => {
    stubMatchMedia(false);
    expect(getMobileLayoutSnapshot()).toBe(false);
  });
});
