import { nodeMatchesBoardFilters, type FilterCombineMode, type ScheduleFilterKind } from "@/lib/board-filters";
import { isNoteNode } from "@/lib/tree-node-kind";
import type { CardColorId } from "@/lib/card-color";
import { isTaskMarkedDone } from "@/lib/task-tags";
import type { TaskNode } from "@/types/task-node";

/** Liegt `id` irgendwo im Teilbaum von `node` (inkl. Wurzel)? */
export function subtreeContainsId(node: TaskNode, id: string): boolean {
  if (node.id === id) return true;
  return node.children.some((c) => subtreeContainsId(c, id));
}

export function findNodeById(nodes: TaskNode[], id: string): TaskNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNodeById(n.children, id);
    if (found) return found;
  }
  return null;
}

/** Felder einer Karte ändern (flach, ohne Kinder). */
export function updateNodeFields(
  roots: TaskNode[],
  nodeId: string,
  fields: Partial<
    Pick<
      TaskNode,
      | "title"
      | "link"
      | "command"
      | "markdown"
      | "description"
      | "tags"
      | "dueDate"
      | "reminderDate"
      | "effort"
      | "effortUnit"
      | "effortSource"
      | "cardColor"
    >
  >,
): TaskNode[] {
  let found = false;
  function mapNodes(nodes: TaskNode[]): TaskNode[] {
    return nodes.map((n) => {
      if (n.id === nodeId) {
        found = true;
        return { ...n, ...fields };
      }
      if (n.children.length === 0) return n;
      return { ...n, children: mapNodes(n.children) };
    });
  }
  const next = mapNodes(roots);
  return found ? next : roots;
}

/** Direkter Eltern-Knoten: `null` = Wurzel; `undefined` = nicht im Baum. */
export function findDirectParentId(
  nodes: TaskNode[],
  childId: string,
  parentId: string | null = null,
): string | null | undefined {
  for (const n of nodes) {
    if (n.id === childId) return parentId;
    const inner = findDirectParentId(n.children, childId, n.id);
    if (inner !== undefined) return inner;
  }
  return undefined;
}

/** Kette der IDs von der Wurzel bis zu `nodeId` (inkl.), oder `null`. */
export function pathFromRootToNode(roots: TaskNode[], nodeId: string): string[] | null {
  for (const r of roots) {
    if (r.id === nodeId) return [r.id];
    const sub = pathFromRootToNode(r.children, nodeId);
    if (sub) return [r.id, ...sub];
  }
  return null;
}

/** Geschwisterliste unter direktem Parent (`null` = Wurzeln). */
export function getSiblingsList(roots: TaskNode[], listParentId: string | null): TaskNode[] {
  if (listParentId === null) return roots;
  const p = findNodeById(roots, listParentId);
  return p?.children ?? [];
}

/**
 * Sichtwald für die Kontext-Liste: erledigte Knoten werden entfernt
 * (Kinder eine Ebene hochgezogen); Filter behält passende Äste
 * (Tags, Farben, Termine — jedes Kriterium einzeln; Verknüpfung per filterCombineMode).
 */
export function rootsForMindmapDisplay(
  roots: TaskNode[],
  opts: {
    hideCompletedTasks: boolean;
    completedTag: string;
    filterTags: string[];
    filterColors?: CardColorId[];
    filterScheduleKinds?: ScheduleFilterKind[];
    filterCombineMode?: FilterCombineMode;
  },
): TaskNode[] {
  const filterColors = opts.filterColors ?? [];
  const filterScheduleKinds = opts.filterScheduleKinds ?? [];
  const filterCombineMode = opts.filterCombineMode ?? "and";
  const hasFacetFilters =
    opts.filterTags.length > 0 || filterColors.length > 0 || filterScheduleKinds.length > 0;

  if (!opts.hideCompletedTasks && !hasFacetFilters) return roots;

  let next = roots;

  if (opts.hideCompletedTasks) {
    const tag = opts.completedTag;
    const lift = (nodes: TaskNode[]): TaskNode[] => {
      const out: TaskNode[] = [];
      for (const n of nodes) {
        if (isTaskMarkedDone(n, tag)) {
          out.push(...lift(n.children));
        } else {
          out.push({
            ...n,
            children: lift(n.children),
          });
        }
      }
      return out;
    };
    next = lift(next);
  }

  if (hasFacetFilters) {
    const filterOpts = {
      filterTags: opts.filterTags,
      filterColors,
      filterScheduleKinds,
      filterCombineMode,
    };
    /**
     * Notizen erscheinen nur, wenn die nächste Eltern-*Karte* den Filter erfüllt.
     * Nicht passende Notizen werden weggelassen; deren Kinder ggf. angehoben.
     */
    const walkMany = (nodes: TaskNode[], parentCardMatches: boolean): TaskNode[] => {
      const out: TaskNode[] = [];
      for (const n of nodes) {
        if (isNoteNode(n)) {
          const kids = walkMany(n.children, parentCardMatches);
          if (parentCardMatches) {
            out.push({ ...n, children: kids });
          } else {
            out.push(...kids);
          }
          continue;
        }
        const selfMatches = nodeMatchesBoardFilters(n, filterOpts);
        const kids = walkMany(n.children, selfMatches);
        if (selfMatches || kids.length > 0) {
          out.push({ ...n, children: kids });
        }
      }
      return out;
    };
    next = walkMany(next, false);
  }

  return next;
}

/** IDs der Karte und aller Nachfahren (Teilbaum). */
export function collectSubtreeNodeIds(root: TaskNode): Set<string> {
  const ids = new Set<string>();
  function walk(n: TaskNode) {
    ids.add(n.id);
    for (const c of n.children) walk(c);
  }
  walk(root);
  return ids;
}

/**
 * Kürzt pathIds so, dass pathIds[0] immer eine Wurzel ist und jeder Eintrag ein direktes Kind
 * des vorherigen ist.
 */
export function normalizePathIds(roots: TaskNode[], pathIds: string[]): string[] {
  const next: string[] = [];
  for (let i = 0; i < pathIds.length; i++) {
    const id = pathIds[i];
    const node = findNodeById(roots, id);
    if (!node) break;

    if (i === 0) {
      const isRoot = roots.some((r) => r.id === id);
      if (!isRoot) break;
      next.push(id);
      continue;
    }

    const parentId = next[i - 1];
    const parent = findNodeById(roots, parentId);
    if (!parent || !parent.children.some((c) => c.id === id)) break;
    next.push(id);
  }
  return next;
}

/** Nach DnD: Pfad bis zur verschobenen Karte (inkl.), sonst vorherigen Pfad normalisieren. */
export function pathIdsAfterNodeMove(
  roots: TaskNode[],
  movedNodeId: string,
  previousPathIds: string[],
): string[] {
  return pathFromRootToNode(roots, movedNodeId) ?? normalizePathIds(roots, previousPathIds);
}

/** Entfernt einen Knoten inkl. gesamtem Teilbaum aus dem Baum und gibt ihn zurück. */
export function detachNodeById(
  nodes: TaskNode[],
  id: string,
): { next: TaskNode[]; detached: TaskNode | null } {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.id === id) {
      const detached = n;
      const next = [...nodes.slice(0, i), ...nodes.slice(i + 1)];
      return { next, detached };
    }
    if (n.children.length > 0) {
      const { next: newChildren, detached } = detachNodeById(n.children, id);
      if (detached) {
        const updated = { ...n, children: newChildren };
        const next = nodes.map((x, idx) => (idx === i ? updated : x));
        return { next, detached };
      }
    }
  }
  return { next: nodes, detached: null };
}

/** Fügt `insert` als Kind von `parentId` (null = Wurzel) an `index` in die Geschwisterliste ein. */
export function insertUnderParent(
  nodes: TaskNode[],
  parentId: string | null,
  index: number,
  insert: TaskNode,
): TaskNode[] {
  if (parentId === null) {
    const next = [...nodes];
    next.splice(index, 0, insert);
    return next;
  }
  return nodes.map((n) => {
    if (n.id === parentId) {
      const ch = [...n.children];
      ch.splice(index, 0, insert);
      return { ...n, children: ch };
    }
    if (n.children.length === 0) return n;
    return { ...n, children: insertUnderParent(n.children, parentId, index, insert) };
  });
}

/** Zielindex in der Geschwisterliste nach Entfernen von `activeId` (für Lücken-Drops). */
export function gapIndexToInsertAfterDetach(
  siblingsIncludingActive: TaskNode[],
  activeId: string,
  gapIndex: number,
): number {
  const n = siblingsIncludingActive.length;
  const g = Math.max(0, Math.min(gapIndex, n));
  const posActive = siblingsIncludingActive.findIndex((x) => x.id === activeId);
  const withoutLen = n - (posActive === -1 ? 0 : 1);
  let insert = g;
  if (posActive !== -1 && posActive < g) insert -= 1;
  return Math.max(0, Math.min(insert, withoutLen));
}
