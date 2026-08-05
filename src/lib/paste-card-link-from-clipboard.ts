import { readClipboardText } from "@/lib/clipboard";
import { normalizeTaskCommand } from "@/lib/task-command";
import { normalizeTaskLink } from "@/lib/task-link";

type CardClipboardFields = { link?: string; command?: string };

/** Liest Zwischenablage: gültige URL → `link`, sonst → `command`. */
export async function saveClipboardLinkToCard(
  nodeId: string,
  updateCard: (id: string, fields: CardClipboardFields) => void,
): Promise<void> {
  const text = await readClipboardText();
  if (text === null) return;

  const trimmed = text.trim();
  if (!trimmed) return;

  const href = normalizeTaskLink(trimmed);
  if (href) {
    updateCard(nodeId, { link: href });
    return;
  }

  const command = normalizeTaskCommand(trimmed);
  if (command) updateCard(nodeId, { command });
}
