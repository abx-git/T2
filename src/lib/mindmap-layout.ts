import type { TaskNode } from "@/types/task-node";

/** Mindesthöhe einer Rasterzeile (px); tatsächliche Höhe kann größer sein. */
export const MINDMAP_ROW_HEIGHT = 56;
/** Breite einer Raster-Spalte (entspricht w-72). */
export const MINDMAP_COL_WIDTH_PX = 288;
export const MINDMAP_COL_GAP_PX = 12;
/** Innenabstand des Karten-Canvas (horizontal). */
export const MINDMAP_BOARD_PAD_X = 4;
/** Innenabstand des Karten-Canvas (vertikal, Anker für Verbindungslinien). */
export const MINDMAP_BOARD_PAD_Y = 8;
/**
 * Fester vertikaler Abstand zwischen Karten (untere Kante → nächste Oberkante).
 * Unabhängig von der Kartenhöhe; die Zeile reserviert nur max(Kartenhöhe) + Abstand.
 */
export const MINDMAP_CARD_GAP_PX = 8;

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
  /** Zeile der Oberkante (0-basiert). */
  ySlot: number;
  slotStart: number;
  slotEnd: number;
  rowSpan: number;
};

export type MindmapBoardLayout = {
  entries: MindmapLayoutEntry[];
  totalRows: number;
  columnCount: number;
  byColumn: Map<number, MindmapLayoutEntry[]>;
  byNodeId: Map<string, MindmapLayoutEntry>;
};

export type ColumnDisplayRow = {
  node: TaskNode;
  listParentId: string | null;
  ySlot: number;
  slotStart: number;
  slotEnd: number;
  rowSpan: number;
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
  for (const col of byColumn.values()) {
    col.sort((a, b) => a.ySlot - b.ySlot || a.slotStart - b.slotStart);
  }
  return { byColumn, byNodeId };
}

function isExpanded(node: TaskNode, collapsedIds: ReadonlySet<string>): boolean {
  return node.children.length > 0 && !collapsedIds.has(node.id);
}

/**
 * Zeilenbedarf des sichtbaren Teilbaums:
 * Blatt = 1 Zeile; sonst Summe der Zeilen aller direkten Kinder (Geschwister-Reihenfolge).
 */
export function measureSubtreeRows(
  node: TaskNode,
  collapsedIds: ReadonlySet<string> = new Set(),
): number {
  if (!isExpanded(node, collapsedIds)) return 1;
  let sum = 0;
  for (const ch of node.children) {
    sum += measureSubtreeRows(ch, collapsedIds);
  }
  return Math.max(sum, 1);
}

/**
 * Raster-Layout (wie Tabellen-Skizze):
 * - Spalte = Tiefe
 * - Erstes Kind in derselben Zeile wie der Parent (Oberkante)
 * - Weitere Geschwister darunter; nächster Geschwister-Block nach Teilbaum-Höhe
 */
function layoutNode(
  node: TaskNode,
  depth: number,
  listParentId: string | null,
  startRow: number,
  collapsedIds: ReadonlySet<string>,
  entries: MindmapLayoutEntry[],
): number {
  const subtreeRows = measureSubtreeRows(node, collapsedIds);
  const slotStart = startRow;
  const slotEnd = startRow + subtreeRows;

  entries.push({
    node,
    column: depth,
    listParentId,
    ySlot: startRow,
    slotStart,
    slotEnd,
    /** Eine Karte = eine Rasterzeile (Tabellen-Layout, Oberkante bündig). */
    rowSpan: 1,
  });

  if (!isExpanded(node, collapsedIds)) {
    return slotEnd;
  }

  let childRow = startRow;
  for (const ch of node.children) {
    childRow = layoutNode(ch, depth + 1, node.id, childRow, collapsedIds, entries);
  }
  return slotEnd;
}

export function computeMindmapBoardLayout(
  roots: TaskNode[],
  collapsedIds: ReadonlySet<string> = new Set(),
): MindmapBoardLayout {
  const entries: MindmapLayoutEntry[] = [];
  let row = 0;
  for (const root of roots) {
    row = layoutNode(root, 0, null, row, collapsedIds, entries);
  }

  let maxCol = 0;
  let totalRows = 0;
  for (const e of entries) {
    if (e.column > maxCol) maxCol = e.column;
    if (e.slotEnd > totalRows) totalRows = e.slotEnd;
  }

  const { byColumn, byNodeId } = buildIndexes(entries);
  return {
    entries,
    totalRows: Math.max(totalRows, 1),
    columnCount: maxCol + 1,
    byColumn,
    byNodeId,
  };
}

export function layoutEntryToDisplayRow(entry: MindmapLayoutEntry): ColumnDisplayRow {
  return {
    node: entry.node,
    listParentId: entry.listParentId,
    ySlot: entry.ySlot,
    slotStart: entry.slotStart,
    slotEnd: entry.slotEnd,
    rowSpan: entry.rowSpan,
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

export function mindmapBoardHeightPx(rowHeights: readonly number[]): number {
  let sum = 0;
  for (const h of rowHeights) sum += h;
  return sum + MINDMAP_BOARD_PAD_Y * 2;
}

export function mindmapBoardHeightPxFromPositions(
  positions: ReadonlyMap<string, MindmapCardPosition>,
): number {
  let maxBottom = MINDMAP_BOARD_PAD_Y;
  for (const p of positions.values()) {
    maxBottom = Math.max(maxBottom, p.top + p.height);
  }
  return maxBottom + MINDMAP_BOARD_PAD_Y;
}

function findNodeInForest(roots: TaskNode[], id: string): TaskNode | null {
  for (const r of roots) {
    if (r.id === id) return r;
    const sub = findNodeInForest(r.children, id);
    if (sub) return sub;
  }
  return null;
}

function siblingsList(roots: TaskNode[], listParentId: string | null): TaskNode[] {
  if (listParentId === null) return roots;
  return findNodeInForest(roots, listParentId)?.children ?? [];
}

function estimateMinCardHeight(e: MindmapLayoutEntry): number {
  const n = e.node;
  let h = 48;
  if (n.title.length > 28) h += 14;
  if (n.description.trim()) h += 36;
  if (n.tags.length > 0) h += 22;
  if (n.dueDate || n.reminderDate) h += 16;
  return h;
}

/** Sichtbare Kartenhöhe aus DOM-Messung (Fallback vor erster Messung). */
export function cardContentHeight(
  e: MindmapLayoutEntry,
  cellHeights: ReadonlyMap<string, number>,
): number {
  const measured = cellHeights.get(e.node.id);
  if (measured != null && measured > 0) return measured;
  return Math.max(estimateMinCardHeight(e), MINDMAP_ROW_HEIGHT);
}

/** Untere Kante der sichtbaren Karte. */
export function visualCardBottomPx(
  entry: MindmapLayoutEntry,
  pos: MindmapCardPosition,
  cellHeights: ReadonlyMap<string, number>,
): number {
  return pos.top + cardContentHeight(entry, cellHeights);
}

function cardBottomPx(
  top: number,
  entry: MindmapLayoutEntry,
  cellHeights: ReadonlyMap<string, number>,
): number {
  return top + cardContentHeight(entry, cellHeights);
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
 * Positioniert Karten per Baumlauf: erstes Kind bündig mit Parent,
 * jedes folgende Geschwister mit konstantem Abstand unter dem vorherigen Teilbaum.
 */
function positionForest(
  nodes: readonly TaskNode[],
  listParentId: string | null,
  parentTop: number | null,
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
          : lastRootBottom.value + MINDMAP_CARD_GAP_PX;
    } else if (i === 0) {
      top = parentTop ?? MINDMAP_BOARD_PAD_Y;
    } else {
      const prevSibling = nodes[i - 1]!;
      top =
        (subtreeBottoms.get(prevSibling.id) ?? MINDMAP_BOARD_PAD_Y) + MINDMAP_CARD_GAP_PX;
    }

    const height = cardContentHeight(entry, cellHeights);
    positions.set(node.id, {
      top,
      left: columnLeftPx(entry.column),
      width: MINDMAP_COL_WIDTH_PX,
      height,
    });

    let subtreeBottom = cardBottomPx(top, entry, cellHeights);
    if (node.children.length > 0) {
      positionForest(
        node.children,
        node.id,
        top,
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

/** Y-Offset der Oberkante einer Rasterzeile (px). */
export function rowTopPx(rowIndex: number, rowHeights: readonly number[]): number {
  let y = 0;
  for (let i = 0; i < rowIndex; i++) y += rowHeights[i] ?? MINDMAP_ROW_HEIGHT;
  return y;
}

/** Gesamthöhe des Rasters inkl. Zeilen (ohne äußeres Padding). */
export function totalRowSpanHeightPx(rowHeights: readonly number[]): number {
  if (!rowHeights.length) return MINDMAP_ROW_HEIGHT;
  return rowHeights.reduce((sum, h) => sum + h, 0);
}

