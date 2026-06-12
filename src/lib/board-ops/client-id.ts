const STORAGE_KEY = "t2-board-ops-client-id-v1";

export function getBoardOpsClientId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing?.trim()) return existing.trim();
    const id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
