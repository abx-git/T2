import type { TaskNode } from "@/types/task-node";

/** @deprecated Nur noch für Legacy-TaskColumn — MindmapGrid nutzt Pixel-Positionen. */
export const MINDMAP_ROW_HEIGHT = 56;
export const MINDMAP_COL_WIDTH_PX = 288;
export const MINDMAP_COL_GAP_PX = 12;
export const MINDMAP_BOARD_PAD_X = 4;
export const MINDMAP_BOARD_PAD_Y = 8;
/** Abstand ober- und unterhalb jeder Karte (zwischen zwei Karten = 2×). */
export const MINDMAP_CARD_MARGIN_Y = 8;
export const MINDMAP_CARD_GAP_PX = MINDMAP_CARD_MARGIN_Y * 2;

const DEFAULT_CARD_HEIGHT_PX = 48;

export type MindmapCardPosition = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type MindmapLayoutEntry = {
  node: TaskNode;
  column: number;
  listParentId: string | null;
};

export type MindmapBoardLayout = {
  entries: MindmapLayoutEntry[];
  columnCount: number;
  byColumn: Map<number, MindmapLayoutEntry[]>;
  byNodeId: Map<string, MindmapLayoutEntry>;
};

export type ColumnDisplayRow = {
  node: TaskNode;
  listParentId: string | null;
};

function buildIndexes(entries: MindmapLayoutEntry[]): {
  byColumn: Map<number, MindmapLayoutEntry[]>;
  byNodeId: Map<string, MindmapLayoutEntry>;
} {
  const byColumn = new Map<number, MindmapLayoutEntry[]>();
  const byNodeId = new Map<string, MindmapLayoutEntry>();
  for (const e of entries) {
    const col = byColumn.get(e.column) ?? [];
    col.push(e);
    byColumn.set(e.column, col);
    byNodeId.set(e.node.id, e);
  }
  return { byColumn, byNodeId };
}

function isExpanded(node: TaskNode, collapsedIds: ReadonlySet<string>): boolean {
  return node.children.length > 0 && !collapsedIds.has(node.id);
}

function layoutNode(
  node: TaskNode,
  depth: number,
  listParentId: string | null,
  collapsedIds: ReadonlySet<string>,
  entries: MindmapLayoutEntry[],
): void {
  entries.push({ node, column: depth, listParentId });
  if (!isExpanded(node, collapsedIds)) return;
  for (const ch of node.children) {
    layoutNode(ch, depth + 1, node.id, collapsedIds, entries);
  }
}

export function computeMindmapBoardLayout(
  roots: TaskNode[],
  collapsedIds: ReadonlySet<string> = new Set(),
): MindmapBoardLayout {
  const entries: MindmapLayoutEntry[] = [];
  for (const root of roots) {
    layoutNode(root, 0, null, collapsedIds, entries);
  }

  let maxCol = 0;
  for (const e of entries) {
    if (e.column > maxCol) maxCol = e.column;
  }

  const { byColumn, byNodeId } = buildIndexes(entries);
  return {
    entries,
    columnCount: maxCol + 1,
    byColumn,
    byNodeId,
  };
}

export function layoutEntryToDisplayRow(entry: MindmapLayoutEntry): ColumnDisplayRow {
  return {
    node: entry.node,
    listParentId: entry.listParentId,
  };
}

export function getLayoutRowsForColumn(
  layout: MindmapBoardLayout,
  columnIndex: number,
): ColumnDisplayRow[] {
  const col = layout.byColumn.get(columnIndex) ?? [];
  return col.map(layoutEntryToDisplayRow);
}

export function columnLeftPx(column: number): number {
  return MINDMAP_BOARD_PAD_X + column * (MINDMAP_COL_WIDTH_PX + MINDMAP_COL_GAP_PX);
}

export function mindmapBoardWidthPx(columnCount: number): number {
  if (columnCount <= 0) return MINDMAP_COL_WIDTH_PX + MINDMAP_BOARD_PAD_X * 2;
  return (
    MINDMAP_BOARD_PAD_X * 2 +
    columnCount * MINDMAP_COL_WIDTH_PX +
    Math.max(0, columnCount - 1) * MINDMAP_COL_GAP_PX
  );
}

export function mindmapBoardHeightPxFromPositions(
  positions: ReadonlyMap<string, MindmapCardPosition>,
): number {
  let maxBottom = MINDMAP_BOARD_PAD_Y;
  for (const p of positions.values()) {
    maxBottom = Math.max(maxBottom, p.top + p.height + MINDMAP_CARD_MARGIN_Y);
  }
  return maxBottom + MINDMAP_BOARD_PAD_Y;
}

/** Sichtbare Kartenhöhe aus DOM-Messung (Fallback bis zur ersten Messung). */
export function cardContentHeight(
  nodeId: string,
  cellHeights: ReadonlyMap<string, number>,
): number {
  const measured = cellHeights.get(nodeId);
  if (measured != null && measured > 0) return measured;
  return DEFAULT_CARD_HEIGHT_PX;
}

function cardVisualBottom(top: number, height: number): number {
  return top + height + MINDMAP_CARD_MARGIN_Y;
}

function topBelowVisualBottom(visualBottom: number): number {
  return visualBottom + MINDMAP_CARD_MARGIN_Y;
}

/** Untere Kante inkl. unterem Kartenabstand. */
export function visualCardBottomPx(
  pos: MindmapCardPosition,
): number {
  return cardVisualBottom(pos.top, pos.height);
}

/** Sichtbare Karten einer Spalte in Baumreihenfolge (Geschwister-Reihenfolge). */
export function entriesInColumnTreeOrder(
  column: number,
  entries: readonly MindmapLayoutEntry[],
  roots: TaskNode[],
): MindmapLayoutEntry[] {
  const entryById = new Map(entries.map((e) => [e.node.id, e]));
  const out: MindmapLayoutEntry[] = [];

  const walk = (nodes: TaskNode[]) => {
    for (const n of nodes) {
      const e = entryById.get(n.id);
      if (e && e.column === column) out.push(e);
      walk(n.children);
    }
  };

  walk(roots);
  return out;
}

/**
 * Positioniert Karten entlang des Baums:
 * - Erstes Kind bündig mit Parent (nie höher)
 * - Geschwister mit festem Abstand (8px oben + 8px unten)
 * - Aufgeblätterte Äste schieben Geschwister in linken Spalten nach unten
 */
function positionForest(
  nodes: readonly TaskNode[],
  listParentId: string | null,
  parentTop: number | null,
  collapsedIds: ReadonlySet<string>,
  entryById: ReadonlyMap<string, MindmapLayoutEntry>,
  cellHeights: ReadonlyMap<string, number>,
  positions: Map<string, MindmapCardPosition>,
  subtreeBottoms: Map<string, number>,
  lastRootBottom: { value: number | null },
): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    const entry = entryById.get(node.id);
    if (!entry) continue;

    let top: number;
    if (listParentId === null) {
      top =
        lastRootBottom.value === null
          ? MINDMAP_BOARD_PAD_Y
          : topBelowVisualBottom(lastRootBottom.value);
    } else if (i === 0) {
      top = parentTop ?? MINDMAP_BOARD_PAD_Y;
    } else {
      const prevSibling = nodes[i - 1]!;
      const prevBottom = subtreeBottoms.get(prevSibling.id) ?? MINDMAP_BOARD_PAD_Y;
      top = topBelowVisualBottom(prevBottom);
    }

    const height = cardContentHeight(node.id, cellHeights);
    positions.set(node.id, {
      top,
      left: columnLeftPx(entry.column),
      width: MINDMAP_COL_WIDTH_PX,
      height,
    });

    let subtreeBottom = cardVisualBottom(top, height);
    if (isExpanded(node, collapsedIds)) {
      positionForest(
        node.children,
        node.id,
        top,
        collapsedIds,
        entryById,
        cellHeights,
        positions,
        subtreeBottoms,
        { value: null },
      );
      for (const ch of node.children) {
        const childBottom = subtreeBottoms.get(ch.id);
        if (childBottom != null) subtreeBottom = Math.max(subtreeBottom, childBottom);
      }
    }

    subtreeBottoms.set(node.id, subtreeBottom);
    if (listParentId === null) lastRootBottom.value = subtreeBottom;
  }
}

export function computeCardPositions(
  entries: readonly MindmapLayoutEntry[],
  cellHeights: ReadonlyMap<string, number>,
  roots: TaskNode[],
  collapsedIds: ReadonlySet<string> = new Set(),
): {
  positions: Map<string, MindmapCardPosition>;
  boardHeight: number;
} {
  const entryById = new Map(entries.map((e) => [e.node.id, e]));
  const positions = new Map<string, MindmapCardPosition>();
  const subtreeBottoms = new Map<string, number>();

  positionForest(
    roots,
    null,
    null,
    collapsedIds,
    entryById,
    cellHeights,
    positions,
    subtreeBottoms,
    { value: null },
  );

  return {
    positions,
    boardHeight: mindmapBoardHeightPxFromPositions(positions),
  };
}
