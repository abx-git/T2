import { defaultLoxIdService, isLoxTaskId } from "@/lib/lox-id";
import type { TaskNode } from "@/types/task-node";

export { isLoxTaskId };

export function collectAllNodeIds(roots: TaskNode[]): Set<string> {
  const taken = new Set<string>();
  const walk = (n: TaskNode) => {
    taken.add(n.id);
    n.children.forEach(walk);
  };
  roots.forEach(walk);
  return taken;
}

/** Neue eindeutige Lox-ID, die noch nicht im Baum vorkommt. */
export function generateUniqueTaskId(roots: TaskNode[]): string {
  const taken = collectAllNodeIds(roots);
  return generateUniqueTaskIdFromTaken(taken);
}

export function generateUniqueTaskIdFromTaken(taken: Set<string>): string {
  const lox = defaultLoxIdService;
  for (let attempt = 0; attempt < 512; attempt++) {
    const id = lox.generateId();
    if (!taken.has(id)) return id;
  }
  throw new Error("Keine freie Karten-ID gefunden.");
}

/** Anzeige auf Karten: Lox-ID formatiert, Legacy-UUID gekürzt. */
export function formatTaskIdForDisplay(id: string): string {
  if (isLoxTaskId(id)) return defaultLoxIdService.normalizeId(id);
  const t = id.trim();
  if (t.length <= 13) return t;
  return `${t.slice(0, 8)}…`;
}
