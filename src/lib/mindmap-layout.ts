import type { TaskNode } from "@/types/task-node";

export const MINDMAP_COL_WIDTH_PX = 288;
export const MINDMAP_COL_GAP_PX = 12;
export const MINDMAP_BOARD_PAD_X = 4;
export const MINDMAP_BOARD_PAD_Y = 8;
/** Zwischen zwei Karten: 8px unter der oberen + 8px über der unteren. */
export const MINDMAP_CARD_GAP_PX = 16;

const DEFAULT_CARD_HEIGHT_PX = 48;
const DROP_HIT_HEIGHT_PX = 12;

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

export type MindmapDropGap = {
  columnIndex: number;
  insertIndex: number;
  listParentId: string | null;
  left: number;
  width: number;
  top: number;
  height: number;
};

export type MindmapRenderLayout = {
  layout: MindmapBoardLayout;
  positions: Map<string, MindmapCardPosition>;
  dropGaps: MindmapDropGap[];
  boardHeight: number;
  boardWidth: number;
};

function isExpanded(node: TaskNode, collapsedIds: ReadonlySet<string>): boolean {
  return node.children.length > 0 && !collapsedIds.has(node.id);
}

function collectEntries(
  node: TaskNode,
  depth: number,
  listParentId: string | null,
  collapsedIds: ReadonlySet<string>,
  entries: MindmapLayoutEntry[],
): void {
  entries.push({ node, column: depth, listParentId });
  if (!isExpanded(node, collapsedIds)) return;
  for (const child of node.children) {
    collectEntries(child, depth + 1, node.id, collapsedIds, entries);
  }
}

function buildBoardLayout(entries: MindmapLayoutEntry[]): MindmapBoardLayout {
  const byColumn = new Map<number, MindmapLayoutEntry[]>();
  const byNodeId = new Map<string, MindmapLayoutEntry>();
  let maxCol = 0;
  for (const entry of entries) {
    const col = byColumn.get(entry.column) ?? [];
    col.push(entry);
    byColumn.set(entry.column, col);
    byNodeId.set(entry.node.id, entry);
    if (entry.column > maxCol) maxCol = entry.column;
  }
  return {
    entries,
    columnCount: maxCol + 1,
    byColumn,
    byNodeId,
  };
}

function cardHeight(nodeId: string, heights: ReadonlyMap<string, number>): number {
  const measured = heights.get(nodeId);
  return measured != null && measured > 0 ? measured : DEFAULT_CARD_HEIGHT_PX;
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

function boardHeightFromPositions(positions: ReadonlyMap<string, MindmapCardPosition>): number {
  let maxBottom = MINDMAP_BOARD_PAD_Y;
  for (const pos of positions.values()) {
    maxBottom = Math.max(maxBottom, pos.top + pos.height);
  }
  return maxBottom + MINDMAP_BOARD_PAD_Y;
}

export function mindmapBoardHeightPxFromPositions(
  positions: ReadonlyMap<string, MindmapCardPosition>,
): number {
  return boardHeightFromPositions(positions);
}

/** Karten einer Spalte in Baumreihenfolge. */
export function entriesInColumnTreeOrder(
  column: number,
  entries: readonly MindmapLayoutEntry[],
  roots: TaskNode[],
): MindmapLayoutEntry[] {
  const entryById = new Map(entries.map((e) => [e.node.id, e]));
  const out: MindmapLayoutEntry[] = [];

  const walk = (nodes: TaskNode[]) => {
    for (const node of nodes) {
      const entry = entryById.get(node.id);
      if (entry?.column === column) out.push(entry);
      walk(node.children);
    }
  };

  walk(roots);
  return out;
}

function dropZoneBetween(
  gapTop: number,
  gapBottom: number,
): { top: number; height: number } | null {
  const span = gapBottom - gapTop;
  if (span < 2) return null;
  const height = Math.min(span, DROP_HIT_HEIGHT_PX);
  return { top: gapTop + (span - height) / 2, height };
}

function siblingInsertIndexBefore(
  roots: TaskNode[],
  listParentId: string | null,
  nodeId: string,
): number {
  const siblings =
    listParentId === null
      ? roots
      : (function find(nodes: TaskNode[]): TaskNode[] | null {
          for (const n of nodes) {
            if (n.id === listParentId) return n.children;
            const sub = find(n.children);
            if (sub) return sub;
          }
          return null;
        })(roots) ?? [];
  return siblings.findIndex((n) => n.id === nodeId);
}

function siblingsOf(roots: TaskNode[], listParentId: string | null): TaskNode[] {
  if (listParentId === null) return roots;
  const find = (nodes: TaskNode[]): TaskNode[] | null => {
    for (const n of nodes) {
      if (n.id === listParentId) return n.children;
      const sub = find(n.children);
      if (sub) return sub;
    }
    return null;
  };
  return find(roots) ?? [];
}

function computeDropGaps(
  roots: TaskNode[],
  layout: MindmapBoardLayout,
  positions: ReadonlyMap<string, MindmapCardPosition>,
): MindmapDropGap[] {
  const gaps: MindmapDropGap[] = [];
  const rootEntries = layout.entries.filter((e) => e.column === 0);

  if (rootEntries.length === 0) {
    const zone = dropZoneBetween(MINDMAP_BOARD_PAD_Y, MINDMAP_BOARD_PAD_Y + DROP_HIT_HEIGHT_PX);
    if (zone) {
      gaps.push({
        columnIndex: 0,
        insertIndex: 0,
        listParentId: null,
        left: columnLeftPx(0),
        width: MINDMAP_COL_WIDTH_PX,
        ...zone,
      });
    }
    return gaps;
  }

  for (let col = 0; col < layout.columnCount; col++) {
    const ordered = entriesInColumnTreeOrder(col, layout.entries, roots);
    for (let i = 0; i < ordered.length; i++) {
      const entry = ordered[i]!;
      const pos = positions.get(entry.node.id);
      if (!pos) continue;

      const prevPos = i > 0 ? positions.get(ordered[i - 1]!.node.id) : null;
      const gapTop = prevPos ? prevPos.top + prevPos.height : MINDMAP_BOARD_PAD_Y;
      const gapBottom = pos.top;
      const zone = dropZoneBetween(gapTop, gapBottom);
      if (!zone) continue;

      gaps.push({
        columnIndex: col,
        insertIndex: siblingInsertIndexBefore(roots, entry.listParentId, entry.node.id),
        listParentId: entry.listParentId,
        left: pos.left,
        width: pos.width,
        ...zone,
      });
    }
  }

  for (const entry of layout.entries) {
    const siblings = siblingsOf(roots, entry.listParentId);
    if (siblings[siblings.length - 1]?.id !== entry.node.id) continue;

    const pos = positions.get(entry.node.id);
    if (!pos) continue;

    const ordered = entriesInColumnTreeOrder(entry.column, layout.entries, roots);
    const index = ordered.findIndex((e) => e.node.id === entry.node.id);
    const nextPos =
      index >= 0 && index < ordered.length - 1
        ? positions.get(ordered[index + 1]!.node.id)
        : null;

    const gapTop = pos.top + pos.height;
    const gapBottom = nextPos?.top ?? gapTop + MINDMAP_CARD_GAP_PX;
    const zone = dropZoneBetween(gapTop, gapBottom);
    if (!zone) continue;

    gaps.push({
      columnIndex: entry.column,
      insertIndex: siblings.length,
      listParentId: entry.listParentId,
      left: pos.left,
      width: pos.width,
      ...zone,
    });
  }

  return gaps;
}

/**
 * Ein Durchlauf: Einträge, Pixel-Positionen, Drop-Zonen.
 * - Kartenhöhe aus DOM-Messung (oder Platzhalter)
 * - Fester Abstand MINDMAP_CARD_GAP_PX zwischen Karten
 * - Erstes Kind nie oberhalb des Parents
 * - Spalten-Fuß verhindert Überlappungen in derselben Spalte
 */
export function layoutMindmap(
  roots: TaskNode[],
  collapsedIds: ReadonlySet<string> = new Set(),
  heights: ReadonlyMap<string, number> = new Map(),
): MindmapRenderLayout {
  const entries: MindmapLayoutEntry[] = [];
  for (const root of roots) {
    collectEntries(root, 0, null, collapsedIds, entries);
  }
  const layout = buildBoardLayout(entries);
  const positions = new Map<string, MindmapCardPosition>();
  const subtreeBottoms = new Map<string, number>();
  const columnNextTop = new Map<number, number>();

  const floorTop = (column: number, wantedTop: number): number => {
    const next = columnNextTop.get(column);
    return next != null ? Math.max(wantedTop, next) : wantedTop;
  };

  const placeNodes = (
    nodes: readonly TaskNode[],
    listParentId: string | null,
    parentTop: number | null,
    lastRootBottom: { value: number | null },
  ): void => {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!;
      const meta = layout.byNodeId.get(node.id);
      if (!meta) continue;

      let wantedTop: number;
      if (listParentId === null) {
        wantedTop =
          lastRootBottom.value === null
            ? MINDMAP_BOARD_PAD_Y
            : lastRootBottom.value + MINDMAP_CARD_GAP_PX;
      } else if (i === 0) {
        wantedTop = parentTop ?? MINDMAP_BOARD_PAD_Y;
      } else {
        const prevSibling = nodes[i - 1]!;
        wantedTop = (subtreeBottoms.get(prevSibling.id) ?? MINDMAP_BOARD_PAD_Y) + MINDMAP_CARD_GAP_PX;
      }

      const top = floorTop(meta.column, wantedTop);
      const height = cardHeight(node.id, heights);
      positions.set(node.id, {
        top,
        left: columnLeftPx(meta.column),
        width: MINDMAP_COL_WIDTH_PX,
        height,
      });
      columnNextTop.set(meta.column, top + height + MINDMAP_CARD_GAP_PX);

      let subtreeBottom = top + height;
      if (isExpanded(node, collapsedIds)) {
        placeNodes(node.children, node.id, top, { value: null });
        for (const child of node.children) {
          const childBottom = subtreeBottoms.get(child.id);
          if (childBottom != null) subtreeBottom = Math.max(subtreeBottom, childBottom);
        }
      }

      subtreeBottoms.set(node.id, subtreeBottom);
      if (listParentId === null) lastRootBottom.value = subtreeBottom;
    }
  };

  placeNodes(roots, null, null, { value: null });

  const boardWidth = mindmapBoardWidthPx(layout.columnCount);
  const boardHeight = boardHeightFromPositions(positions);
  const dropGaps = computeDropGaps(roots, layout, positions);

  return { layout, positions, dropGaps, boardHeight, boardWidth };
}

/** Struktur ohne Pixel-Positionen (DnD, Spaltenanzahl). */
export function computeMindmapBoardLayout(
  roots: TaskNode[],
  collapsedIds: ReadonlySet<string> = new Set(),
): MindmapBoardLayout {
  const entries: MindmapLayoutEntry[] = [];
  for (const root of roots) {
    collectEntries(root, 0, null, collapsedIds, entries);
  }
  return buildBoardLayout(entries);
}

export function getLayoutRowsForColumn(
  layout: MindmapBoardLayout,
  columnIndex: number,
): ColumnDisplayRow[] {
  const col = layout.byColumn.get(columnIndex) ?? [];
  return col.map((entry) => ({
    node: entry.node,
    listParentId: entry.listParentId,
  }));
}

/** @deprecated Tests — nutzt layoutMindmap. */
export function computeCardPositions(
  entries: readonly MindmapLayoutEntry[],
  cellHeights: ReadonlyMap<string, number>,
  roots: TaskNode[],
  collapsedIds: ReadonlySet<string> = new Set(),
): {
  positions: Map<string, MindmapCardPosition>;
  boardHeight: number;
} {
  const layout = buildBoardLayout([...entries]);
  const { positions, boardHeight } = layoutMindmap(roots, collapsedIds, cellHeights);
  return { positions, boardHeight };
}
