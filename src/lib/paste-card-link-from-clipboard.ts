import { readClipboardText } from "@/lib/clipboard";
import { normalizeTaskLink } from "@/lib/task-link";

/** Liest einen Link aus der Zwischenablage und speichert ihn auf der Karte, falls gültig. */
export async function saveClipboardLinkToCard(
  nodeId: string,
  updateCard: (id: string, fields: { link: string }) => void,
): Promise<void> {
  const text = await readClipboardText();
  if (text === null) return;

  const href = normalizeTaskLink(text);
  if (!href) return;

  updateCard(nodeId, { link: href });
}
