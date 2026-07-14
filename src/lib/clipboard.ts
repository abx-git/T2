export async function readClipboardText(): Promise<string | null> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
      return await navigator.clipboard.readText();
    }
  } catch {
    // Berechtigung verweigert oder nicht verfügbar
  }
  return null;
}
