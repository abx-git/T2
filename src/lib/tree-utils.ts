import { isTaskMarkedDone } from "@/lib/task-tags";
import type { TaskNode } from "@/types/task-node";
import type { BoardDropPreview, DropIntent } from "@/types/dnd-preview";

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
  fields: Partial<Pick<TaskNode, "title" | "description" | "tags" | "dueDate" | "reminderDate" | "effort">>,
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

/** Spaltenindex, in dem der Knoten aktuell sichtbar ist. */
export function columnIndexOfNode(
  roots: TaskNode[],
  pathIds: string[],
  nodeId: string,
): number | null {
  const maxC = maxBoardColumnIndex(roots, pathIds);
  for (let c = 0; c <= maxC; c++) {
    const col = getColumnDisplayRows(roots, pathIds, c);
    if (col.some((r) => r.node.id === nodeId)) return c;
  }
  return null;
}

/** Alle Knoten-IDs auf dem geöffneten Pfad inkl. Teilbaum unter dem letzten Pfad-Knoten. */
export function getCurrentBranchNodeIds(roots: TaskNode[], pathIds: string[]): Set<string> {
  const out = new Set<string>();
  for (const id of pathIds) {
    out.add(id);
  }
  if (pathIds.length === 0) return out;
  const leafId = pathIds[pathIds.length - 1];
  const leaf = findNodeById(roots, leafId);
  if (!leaf) return out;
  function walk(n: TaskNode) {
    out.add(n.id);
    n.children.forEach(walk);
  }
  leaf.children.forEach(walk);
  return out;
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

/** Längste Kette Kanten unterhalb von `node` bis zu einem Blatt (0 = Blatt). */
export function maxChainDepthBelow(node: TaskNode): number {
  if (!node.children.length) return 0;
  return 1 + Math.max(...node.children.map(maxChainDepthBelow));
}

/** Anzahl Spalten: Pfad + eine Spalte pro weiterer Tiefe unter dem Pfad-Endknoten. */
export function boardColumnCount(roots: TaskNode[], pathIds: string[]): number {
  if (pathIds.length === 0) return 1;
  const leaf = findNodeById(roots, pathIds[pathIds.length - 1]);
  const maxBelow = leaf ? maxChainDepthBelow(leaf) : 0;
  return pathIds.length + 1 + Math.max(0, maxBelow - 1);
}

export function maxBoardColumnIndex(roots: TaskNode[], pathIds: string[]): number {
  return boardColumnCount(roots, pathIds) - 1;
}

/** Zeile in der Spaltenansicht: Knoten und zugehörige Geschwisterliste (DnD). */
export type ColumnDisplayRow = {
  node: TaskNode;
  listParentId: string | null;
};

/** Blendet Karten mit Status „erledigt“ für die Ansicht aus (Daten bleiben unverändert). */
export function filterColumnRowsHideCompleted(rows: ColumnDisplayRow[]): ColumnDisplayRow[] {
  return rows.filter((r) => !isTaskMarkedDone(r.node));
}

/**
 * Spalte 0 = Wurzeln; Spalten 1…pathIds.length = direkte Kinder von pathIds[k - 1];
 * Spalten danach = alle Knoten mit festem Baum-Abstand zum Pfad-Endknoten (eine Spalte pro weiterer Tiefe).
 */
export function getColumnDisplayRows(
  roots: TaskNode[],
  pathIds: string[],
  columnIndex: number,
): ColumnDisplayRow[] {
  if (columnIndex === 0) {
    return roots.map((node) => ({ node, listParentId: null }));
  }
  if (columnIndex <= pathIds.length) {
    const parentOnPathId = pathIds[columnIndex - 1];
    if (!parentOnPathId) return [];
    const parentOnPath = findNodeById(roots, parentOnPathId);
    if (!parentOnPath) return [];
    return parentOnPath.children.map((node) => ({
      node,
      listParentId: parentOnPathId,
    }));
  }
  if (pathIds.length === 0) return [];
  const leafId = pathIds[pathIds.length - 1];
  const leaf = findNodeById(roots, leafId);
  if (!leaf) return [];
  const relDepth = columnIndex - pathIds.length + 1;
  return descendantsAtDepthFromAncestor(leaf, relDepth);
}

/** Alle Knoten mit Abstand `relDepth` (Kanten) vom Pfad-Endknoten; `relDepth` 1 = direkte Kinder. */
function descendantsAtDepthFromAncestor(ancestor: TaskNode, relDepth: number): ColumnDisplayRow[] {
  const out: ColumnDisplayRow[] = [];
  if (relDepth < 1) return [];
  function dfs(n: TaskNode, d: number, listParentId: string) {
    if (d === relDepth) {
      out.push({ node: n, listParentId: listParentId });
      return;
    }
    for (const ch of n.children) {
      dfs(ch, d + 1, n.id);
    }
  }
  for (const ch of ancestor.children) {
    dfs(ch, 1, ancestor.id);
  }
  return out;
}

/** Knoten, die in Spalte `columnIndex` sichtbar sind (0 = Wurzeln). */
export function getColumnNodes(
  roots: TaskNode[],
  pathIds: string[],
  columnIndex: number,
): TaskNode[] {
  return getColumnDisplayRows(roots, pathIds, columnIndex).map((r) => r.node);
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

function updateNodeChildren(
  nodes: TaskNode[],
  parentId: string,
  nextChildren: TaskNode[],
): TaskNode[] {
  return nodes.map((node) => {
    if (node.id === parentId) {
      return { ...node, children: nextChildren };
    }
    if (node.children.length === 0) return node;
    return { ...node, children: updateNodeChildren(node.children, parentId, nextChildren) };
  });
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

/** Einfügelücke in einer Spalte: `insertIndex` = Slot vor dem Listenelement mit diesem Index (0…Kartenanzahl). */
export const COLUMN_GAP_PREFIX = "column-gap:";

const GAP_LIST_PARENT_ROOT = "__root__";

/** Eindeutige Droppable-ID inkl. Geschwisterliste (`listParentId`). */
export function columnGapId(
  columnIndex: number,
  insertIndex: number,
  listParentId: string | null,
): string {
  const key = listParentId === null ? GAP_LIST_PARENT_ROOT : encodeURIComponent(listParentId);
  return `${COLUMN_GAP_PREFIX}${columnIndex}|${key}|${insertIndex}`;
}

export function parseColumnGapId(overId: string | number): {
  columnIndex: number;
  insertIndex: number;
  listParentId: string | null;
} | null {
  const s = String(overId);
  if (!s.startsWith(COLUMN_GAP_PREFIX)) return null;
  const rest = s.slice(COLUMN_GAP_PREFIX.length);
  const a = rest.indexOf("|");
  const b = rest.indexOf("|", a + 1);
  if (a === -1 || b === -1) return null;
  const columnIndex = Number(rest.slice(0, a));
  const keyStr = rest.slice(a + 1, b);
  const insertIndex = Number(rest.slice(b + 1));
  if (!Number.isFinite(columnIndex) || !Number.isFinite(insertIndex)) return null;
  let listParentId: string | null;
  if (keyStr === GAP_LIST_PARENT_ROOT) listParentId = null;
  else {
    try {
      listParentId = decodeURIComponent(keyStr);
    } catch {
      listParentId = keyStr;
    }
  }
  return { columnIndex, insertIndex, listParentId };
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

export type TreeDragOverKind =
  | { kind: "columnGap"; columnIndex: number; insertIndex: number; listParentId: string | null }
  | { kind: "card"; columnIndex: number; cardId: string; listParentId: string | null };

/** Nach Entfernen von `activeId`: Einfüge-Index so, dass die Karte direkt UNTER `targetId` liegt. */
export function insertIndexBelowCardAmongSiblings(
  siblingsIncludingActive: TaskNode[],
  activeId: string,
  targetId: string,
): number {
  const without = siblingsIncludingActive.filter((n) => n.id !== activeId);
  const overIdx = without.findIndex((n) => n.id === targetId);
  if (overIdx < 0) return without.length;
  return Math.min(overIdx + 1, without.length);
}

function mapIntentToPreview(
  activeId: string,
  intent: DropIntent,
  toCol: number,
  insertIndex: number,
  anchorCardId: string | null,
  gapListParentId: string | null | undefined,
): BoardDropPreview {
  const targetMode: "column" | "card" =
    intent === "column-end" || intent === "reorder-gap" ? "column" : "card";
  return {
    activeId,
    targetMode,
    intent,
    toCol,
    insertIndex,
    anchorCardId,
    gapListParentId: targetMode === "column" ? gapListParentId : undefined,
  };
}

function listParentExpectedForColumn(pathIds: string[], columnIndex: number): string | null {
  if (columnIndex === 0) return null;
  return pathIds[columnIndex - 1] ?? null;
}

/** Lücken in Spalten unterhalb des Pfad-Endes: Geschwisterliste muss im Teilbaum unter dem Blatt liegen. */
function gapListParentAllowedInDepthSliceColumns(
  roots: TaskNode[],
  pathIds: string[],
  lp: string | null,
): boolean {
  if (lp === null) return false;
  const leafId = pathIds[pathIds.length - 1];
  const leaf = findNodeById(roots, leafId);
  if (!leaf) return false;
  return lp === leafId || subtreeContainsId(leaf, lp);
}

/** Öffentlich für DnD-Over-Daten in Spalten-Komponenten. */
export function listParentForColumn(pathIds: string[], columnIndex: number): string | null {
  if (columnIndex === 0) return null;
  if (columnIndex <= pathIds.length) return pathIds[columnIndex - 1] ?? null;
  return pathIds[pathIds.length - 1] ?? null;
}

/** Index der Karte in ihrer Geschwisterliste (für Lücken-Drops bei mehreren Eltern pro Spalte). */
export function siblingInsertIndexBeforeCard(
  roots: TaskNode[],
  listParentId: string | null,
  childId: string,
): number {
  const sibs = getSiblingsList(roots, listParentId);
  const i = sibs.findIndex((x) => x.id === childId);
  return Math.max(0, i);
}

export function buildMindmapDropPreview(
  roots: TaskNode[],
  pathIds: string[],
  activeId: string,
  overKind: TreeDragOverKind,
): BoardDropPreview | null {
  const activeNode = findNodeById(roots, activeId);
  if (!activeNode) return null;

  if (overKind.kind === "columnGap") {
    const { columnIndex: c, insertIndex: gapIdx, listParentId: lp } = overKind;
    const pathLeafCol = pathIds.length;
    if (pathIds.length > 0 && c > pathLeafCol) {
      if (!gapListParentAllowedInDepthSliceColumns(roots, pathIds, lp)) return null;
    } else {
      const expected = listParentExpectedForColumn(pathIds, c);
      if (lp !== expected) return null;
    }
    if (lp !== null && (activeId === lp || subtreeContainsId(activeNode, lp))) {
      return null;
    }
    const sibs = getSiblingsList(roots, lp);
    if (gapIdx < 0 || gapIdx > sibs.length) return null;
    const intent: DropIntent = c === 0 && gapIdx === sibs.length ? "column-end" : "reorder-gap";
    return mapIntentToPreview(activeId, intent, c, gapIdx, null, lp);
  }

  const targetId = overKind.cardId;
  const targetCol = overKind.columnIndex;
  if (targetId === activeId) return null;

  const pt = findDirectParentId(roots, targetId);
  if (pt === undefined) return null;

  const pa = findDirectParentId(roots, activeId);
  if (pa === undefined) return null;

  const listParent = overKind.listParentId;
  const sourceCol = columnIndexOfNode(roots, pathIds, activeId);
  const sameColumn = sourceCol !== null && sourceCol === targetCol;

  if (targetCol === 0) {
    if (pt !== null || listParent !== null) return null;
    if (sameColumn) {
      if (subtreeContainsId(activeNode, targetId)) return null;
      if (!findNodeById(roots, targetId)) return null;
      return mapIntentToPreview(activeId, "nest-under", 0, 0, targetId, undefined);
    }
    const insertIndex = insertIndexBelowCardAmongSiblings(roots, activeId, targetId);
    return mapIntentToPreview(activeId, "root-sibling", 0, insertIndex, targetId, undefined);
  }

  if (pt !== listParent) return null;

  if (sameColumn) {
    if (subtreeContainsId(activeNode, targetId)) return null;
    if (!findNodeById(roots, targetId)) return null;
    return mapIntentToPreview(activeId, "nest-under", targetCol, 0, targetId, undefined);
  }

  if (pa === pt) {
    const sibs = getSiblingsList(roots, listParent);
    const insertIndex = insertIndexBelowCardAmongSiblings(sibs, activeId, targetId);
    return mapIntentToPreview(activeId, "reorder-sibling", targetCol, insertIndex, targetId, undefined);
  }

  if (subtreeContainsId(activeNode, targetId)) return null;
  if (!findNodeById(roots, targetId)) return null;

  return mapIntentToPreview(activeId, "nest-under", targetCol, 0, targetId, undefined);
}

/**
 * Mindmap-DnD (Spalten):
 * - Lücke in einer Spalte (`columnGap`): Geschwisterliste umsortieren / an Position einfügen.
 * - Karte in derselben Spalte wie Quelle: unter die Zielkarte nesten (Kind).
 * - Karte in anderer Spalte / Kontext: wie zuvor (Wurzel-Geschwister, Geschwister-Reorder über Spaltengrenze, Nest).
 */
export function applyMindmapDrop(
  roots: TaskNode[],
  pathIds: string[],
  activeId: string,
  overKind: TreeDragOverKind,
): TaskNode[] {
  const activeNode = findNodeById(roots, activeId);
  if (!activeNode) return roots;

  if (overKind.kind === "columnGap") {
    const { columnIndex: c, insertIndex: gapIdx, listParentId: lp } = overKind;
    const pathLeafCol = pathIds.length;
    if (pathIds.length > 0 && c > pathLeafCol) {
      if (!gapListParentAllowedInDepthSliceColumns(roots, pathIds, lp)) return roots;
    } else {
      const expected = listParentExpectedForColumn(pathIds, c);
      if (lp !== expected) return roots;
    }
    if (lp !== null && (activeId === lp || subtreeContainsId(activeNode, lp))) {
      return roots;
    }
    const sibsBefore = getSiblingsList(roots, lp);
    if (gapIdx < 0 || gapIdx > sibsBefore.length) return roots;
    const insertAt = gapIndexToInsertAfterDetach(sibsBefore, activeId, gapIdx);
    const { next: r1, detached } = detachNodeById(roots, activeId);
    if (!detached) return roots;
    return insertUnderParent(r1, lp, insertAt, structuredClone(detached));
  }

  const targetId = overKind.cardId;
  const targetCol = overKind.columnIndex;
  if (targetId === activeId) return roots;

  const pt = findDirectParentId(roots, targetId);
  if (pt === undefined) return roots;

  const pa = findDirectParentId(roots, activeId);
  if (pa === undefined) return roots;

  const listParent = overKind.listParentId;
  const sourceCol = columnIndexOfNode(roots, pathIds, activeId);
  const sameColumn = sourceCol !== null && sourceCol === targetCol;

  if (targetCol === 0) {
    if (pt !== null || listParent !== null) return roots;
    if (sameColumn) {
      if (subtreeContainsId(activeNode, targetId)) return roots;
      if (!findNodeById(roots, targetId)) return roots;
    }
  } else {
    if (pt !== listParent) return roots;
    if (sameColumn) {
      if (subtreeContainsId(activeNode, targetId)) return roots;
    } else if (pa !== pt) {
      if (subtreeContainsId(activeNode, targetId)) return roots;
      const targetNode = findNodeById(roots, targetId);
      if (!targetNode) return roots;
    }
  }

  const { next: r1, detached } = detachNodeById(roots, activeId);
  if (!detached) return roots;
  const clone = structuredClone(detached) as TaskNode;

  if (targetCol === 0) {
    if (!sameColumn) {
      const insertIndex = insertIndexBelowCardAmongSiblings(roots, activeId, targetId);
      return insertUnderParent(r1, null, insertIndex, clone);
    }
    const targetAfter = findNodeById(r1, targetId)!;
    return updateNodeChildren(r1, targetId, [...targetAfter.children, clone]);
  }

  if (sameColumn) {
    const targetAfter = findNodeById(r1, targetId)!;
    return updateNodeChildren(r1, targetId, [...targetAfter.children, clone]);
  }

  if (pa === pt) {
    const sibsBefore = getSiblingsList(roots, listParent);
    const insertIndex = insertIndexBelowCardAmongSiblings(sibsBefore, activeId, targetId);
    return insertUnderParent(r1, listParent, insertIndex, clone);
  }

  const targetAfter = findNodeById(r1, targetId)!;
  const nextChildren = [...targetAfter.children, clone];
  return updateNodeChildren(r1, targetId, nextChildren);
}
