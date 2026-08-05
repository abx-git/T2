import { describe, expect, it, vi } from "vitest";

import { readClipboardText } from "@/lib/clipboard";
import { saveClipboardLinkToCard } from "@/lib/paste-card-link-from-clipboard";

vi.mock("@/lib/clipboard", () => ({
  readClipboardText: vi.fn(),
}));

describe("saveClipboardLinkToCard", () => {
  it("speichert einen gültigen Link aus der Zwischenablage", async () => {
    vi.mocked(readClipboardText).mockResolvedValue("example.com/doc");
    const updateCard = vi.fn();

    await saveClipboardLinkToCard("card-1", updateCard);

    expect(updateCard).toHaveBeenCalledWith("card-1", {
      link: "https://example.com/doc",
    });
  });

  it("speichert einen Befehl, wenn keine gültige URL erkannt wird", async () => {
    vi.mocked(readClipboardText).mockResolvedValue("npm run build");
    const updateCard = vi.fn();

    await saveClipboardLinkToCard("card-1", updateCard);

    expect(updateCard).toHaveBeenCalledWith("card-1", {
      command: "npm run build",
    });
  });

  it("tut nichts bei leerer Zwischenablage", async () => {
    const updateCard = vi.fn();

    vi.mocked(readClipboardText).mockResolvedValue(null);
    await saveClipboardLinkToCard("card-1", updateCard);
    expect(updateCard).not.toHaveBeenCalled();

    vi.mocked(readClipboardText).mockResolvedValue("   ");
    await saveClipboardLinkToCard("card-1", updateCard);
    expect(updateCard).not.toHaveBeenCalled();
  });
});
