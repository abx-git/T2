"use client";

import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { resolveColumnDisplayTitle } from "@/lib/column-titles";
import {
  computeCardPositions,
  columnLeftPx,
  entriesInColumnTreeOrder,
  MINDMAP_BOARD_PAD_Y,
  MINDMAP_COL_GAP_PX,
  MINDMAP_COL_WIDTH_PX,
  mindmapBoardWidthPx,
  visualCardBottomPx,
  type MindmapBoardLayout,
} from "@/lib/mindmap-layout";
import {
  columnGapId,
  getSiblingsList,
  siblingInsertIndexBeforeCard,
} from "@/lib/tree-utils";
import type { CardFieldVisibility } from "@/lib/card-field-visibility";
import type { BoardDropPreview } from "@/types/dnd-preview";
import type { TaskNode } from "@/types/task-node";

import { MindmapConnectors } from "./mindmap-connectors";
import { TaskCard, type TaskTitleSaveMeta } from "./task-card";

function DropSlotLine() {
  return (
    <div className="pointer-events-none flex h-full items-center py-0.5" aria-hidden>
      <div className="h-1.5 w-full rounded-full bg-sky-600 shadow-[0_0_0_2px_rgba(255,255,255,1)] ring-2 ring-sky-200/90" />
    </div>
  );
}

function GridInsertGap({
  columnIndex,
  insertIndex,
  listParentId,
  showLine,
  highlightColumn,
  style,
}: {
  columnIndex: number;
  insertIndex: number;
  listParentId: string | null;
  showLine: boolean;
  highlightColumn: boolean;
  style: CSSProperties;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnGapId(columnIndex, insertIndex, listParentId),
    data: {
      kind: "columnGap" as const,
      columnIndex,
      insertIndex,
      listParentId,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={[
        "absolute z-30 flex min-h-[4px] rounded-md transition-colors",
        highlightColumn && isOver ? "bg-sky-100/90 ring-2 ring-sky-500" : "",
        !highlightColumn && isOver ? "bg-sky-50/80" : "",
      ].join(" ")}
      style={style}
    >
      {showLine ? <DropSlotLine /> : null}
    </div>
  );
}

const GAP_HIT_HEIGHT_PX = 12;

/** Trefferzone strikt zwischen zoneTop (Karte oben) und zoneBottom (Karte unten). */
function gapZoneBetween(
  zoneTop: number,
  zoneBottom: number,
): { top: number; height: number } | null {
  const span = zoneBottom - zoneTop;
  if (span < 2) return null;
  const height = Math.min(span, GAP_HIT_HEIGHT_PX);
  const top = zoneTop + (span - height) / 2;
  return { top, height };
}

type GapSlot = {
  key: string;
  columnIndex: number;
  insertIndex: number;
  listParentId: string | null;
  left: number;
  width: number;
  zone: { top: number; height: number };
  highlightColumn: boolean;
};

export interface MindmapGridProps {
  layout: MindmapBoardLayout;
  roots: TaskNode[];
  columnCount: number;
  columnTitleOverrides: Record<number, string>;
  collapsedIds: Set<string>;
  searchFocusNodeId?: string | null;
  onPasteSubtreeUnder: (parentId: string) => void;
  onAddRootCard: () => void;
  onAddChildCard: (parentId: string) => void;
  onOpenDetails: (nodeId: string) => void;
  onToggleCollapsed: (nodeId: string) => void;
  titleEditNodeId: string | null;
  onTitleSave: (nodeId: string, title: string, meta?: TaskTitleSaveMeta) => void;
  onTitleEditCancel: (nodeId: string) => void;
  onActivateBranch: (nodeId: string) => void;
  dropPreview: BoardDropPreview | null;
  fieldVisibility: CardFieldVisibility;
  onCopySubtree?: (node: TaskNode) => void;
  onRequestDelete?: (nodeId: string) => void;
}

export function MindmapGrid({
  layout,
  roots,
  columnCount,
  columnTitleOverrides,
  collapsedIds,
  searchFocusNodeId = null,
  onPasteSubtreeUnder,
  onAddRootCard,
  onAddChildCard,
  onOpenDetails,
  onToggleCollapsed,
  titleEditNodeId,
  onTitleSave,
  onTitleEditCancel,
  onActivateBranch,
  dropPreview,
  fieldVisibility,
  onCopySubtree,
  onRequestDelete,
}: MindmapGridProps) {
  const visibleEntries = layout.entries;

  const [cardHeights, setCardHeights] = useState<Map<string, number>>(() => new Map());
  const cardElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const measureCardElement = useCallback((el: HTMLDivElement): number => {
    const card = el.querySelector<HTMLElement>("[data-task-card-id]");
    const cardH =
      card?.offsetHeight ??
      card?.getBoundingClientRect().height ??
      el.getBoundingClientRect().height;
    return Math.max(Math.ceil(cardH), 1);
  }, []);

  const publishCardHeights = useCallback(() => {
    const elements = cardElementsRef.current;
    setCardHeights((prev) => {
      if (elements.size === 0) return prev.size === 0 ? prev : new Map();
      let changed = false;
      const next = new Map<string, number>();
      for (const [id, el] of elements) {
        const h = measureCardElement(el);
        const prevH = prev.get(id) ?? 0;
        if (h <= 0) continue;
        if (prevH === 0 || h <= prevH || Math.abs(prevH - h) >= 4) {
          next.set(id, h);
          if (prevH !== h) changed = true;
        } else {
          next.set(id, prevH);
        }
      }
      if (next.size !== prev.size) changed = true;
      return changed ? next : prev;
    });
  }, [measureCardElement]);

  const observeCard = useCallback((nodeId: string, el: HTMLDivElement | null) => {
    if (el) {
      if (cardElementsRef.current.get(nodeId) === el) return;
      cardElementsRef.current.set(nodeId, el);
      resizeObserverRef.current?.observe(el);
      return;
    }
    const prev = cardElementsRef.current.get(nodeId);
    if (!prev) return;
    resizeObserverRef.current?.unobserve(prev);
    cardElementsRef.current.delete(nodeId);
  }, []);

  const cardRefCallbacksRef = useRef(new Map<string, (el: HTMLDivElement | null) => void>());
  const cardRef = useCallback(
    (nodeId: string) => {
      const cached = cardRefCallbacksRef.current.get(nodeId);
      if (cached) return cached;
      const fn = (el: HTMLDivElement | null) => observeCard(nodeId, el);
      cardRefCallbacksRef.current.set(nodeId, fn);
      return fn;
    },
    [observeCard],
  );

  const { positions, rowHeights, boardHeight } = useMemo(
    () => computeCardPositions(visibleEntries, cardHeights),
    [visibleEntries, cardHeights],
  );

  const boardWidth = mindmapBoardWidthPx(columnCount);

  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      publishCardHeights();
      raf2 = requestAnimationFrame(() => publishCardHeights());
    });
    let roRaf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(roRaf);
      roRaf = requestAnimationFrame(() => publishCardHeights());
    });
    resizeObserverRef.current = ro;
    for (const el of cardElementsRef.current.values()) ro.observe(el);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      cancelAnimationFrame(roRaf);
      ro.disconnect();
      resizeObserverRef.current = null;
    };
  }, [publishCardHeights, visibleEntries, fieldVisibility, titleEditNodeId]);

  const headerGridStyle = useMemo(
    () => ({
      gridTemplateColumns: `repeat(${columnCount}, ${MINDMAP_COL_WIDTH_PX}px)`,
      columnGap: `${MINDMAP_COL_GAP_PX}px`,
    }),
    [columnCount],
  );

  const gapLineAt = (columnIndex: number, insertIndex: number, gapLp: string | null) => {
    if (!dropPreview || dropPreview.toCol !== columnIndex || dropPreview.targetMode !== "column") {
      return false;
    }
    const sortIntent =
      dropPreview.intent === "reorder-gap" ||
      dropPreview.intent === "column-end" ||
      dropPreview.intent === "reorder-sibling" ||
      dropPreview.intent === "root-sibling";
    if (!sortIntent) return false;
    return (
      dropPreview.insertIndex === insertIndex &&
      (dropPreview.gapListParentId === undefined || dropPreview.gapListParentId === gapLp)
    );
  };

  const isMainTailHighlight = useCallback(
    (columnIndex: number, insertIndex: number, gapLp: string | null) =>
      columnIndex === 0 &&
      gapLp === null &&
      Boolean(
        dropPreview?.intent === "column-end" &&
          dropPreview.insertIndex === insertIndex &&
          (dropPreview.gapListParentId === undefined || dropPreview.gapListParentId === null),
      ),
    [dropPreview],
  );

  const visibleRootEntries = useMemo(
    () => visibleEntries.filter((e) => e.column === 0),
    [visibleEntries],
  );
  const showEmptyRootSlot = visibleRootEntries.length === 0;

  const nextInColumnByNodeId = useMemo(() => {
    const nextInColumnByNodeId = new Map<string, (typeof visibleEntries)[number] | null>();
    for (let col = 0; col < columnCount; col++) {
      const ordered = entriesInColumnTreeOrder(col, visibleEntries, roots);
      for (let i = 0; i < ordered.length; i++) {
        nextInColumnByNodeId.set(
          ordered[i]!.node.id,
          i < ordered.length - 1 ? ordered[i + 1]! : null,
        );
      }
    }
    return nextInColumnByNodeId;
  }, [visibleEntries, roots, columnCount]);

  const gapSlots = useMemo((): GapSlot[] => {
    const slots: GapSlot[] = [];

    if (showEmptyRootSlot) {
      const zone = gapZoneBetween(MINDMAP_BOARD_PAD_Y, MINDMAP_BOARD_PAD_Y + GAP_HIT_HEIGHT_PX);
      if (zone) {
        slots.push({
          key: "empty-root",
          columnIndex: 0,
          insertIndex: 0,
          listParentId: null,
          left: columnLeftPx(0),
          width: MINDMAP_COL_WIDTH_PX,
          zone,
          highlightColumn: isMainTailHighlight(0, 0, null),
        });
      }
    }

    for (let col = 0; col < columnCount; col++) {
      const ordered = entriesInColumnTreeOrder(col, visibleEntries, roots);
      for (let i = 0; i < ordered.length; i++) {
        const entry = ordered[i]!;
        const pos = positions.get(entry.node.id);
        if (!pos) continue;

        const prev = i > 0 ? ordered[i - 1]! : null;
        const prevPos = prev ? positions.get(prev.node.id) : null;
        const zoneTop =
          prev && prevPos
            ? visualCardBottomPx(prev, prevPos, cardHeights)
            : MINDMAP_BOARD_PAD_Y;
        const zone = gapZoneBetween(zoneTop, pos.top);
        if (zone) {
          slots.push({
            key: `between-${prev?.node.id ?? "start"}-${entry.node.id}`,
            columnIndex: col,
            insertIndex: siblingInsertIndexBeforeCard(roots, entry.listParentId, entry.node.id),
            listParentId: entry.listParentId,
            left: pos.left,
            width: pos.width,
            zone,
            highlightColumn: false,
          });
        }
      }
    }

    for (const entry of visibleEntries) {
      const siblings = getSiblingsList(roots, entry.listParentId);
      if (siblings[siblings.length - 1]?.id !== entry.node.id) continue;

      const pos = positions.get(entry.node.id);
      if (!pos) continue;

      const tailInsert = siblings.length;
      const nextEntry = nextInColumnByNodeId.get(entry.node.id) ?? null;
      const nextPos = nextEntry ? positions.get(nextEntry.node.id) : null;
      const zoneTop = visualCardBottomPx(entry, pos, cardHeights);
      const zoneBottom = nextPos?.top ?? zoneTop + GAP_HIT_HEIGHT_PX + 2;
      const zone = gapZoneBetween(zoneTop, zoneBottom);
      if (!zone) continue;

      slots.push({
        key: `tail-${entry.node.id}`,
        columnIndex: entry.column,
        insertIndex: tailInsert,
        listParentId: entry.listParentId,
        left: pos.left,
        width: pos.width,
        zone,
        highlightColumn: isMainTailHighlight(entry.column, tailInsert, entry.listParentId),
      });
    }

    return slots;
  }, [
    showEmptyRootSlot,
    columnCount,
    visibleEntries,
    roots,
    positions,
    cardHeights,
    nextInColumnByNodeId,
    dropPreview,
    isMainTailHighlight,
  ]);

  const cardRows = useMemo(() => {
    return visibleEntries.flatMap((e) => {
      const pos = positions.get(e.node.id);
      if (!pos) return [];
      const previewHere =
        dropPreview && dropPreview.toCol === e.column ? dropPreview : null;
      return [{ entry: e, pos, previewHere }];
    });
  }, [visibleEntries, positions, dropPreview]);

  return (
    <div className="inline-block min-w-min">
      <div className="mb-2 grid" style={headerGridStyle}>
        {Array.from({ length: columnCount }, (_, columnIndex) => (
          <div
            key={`hdr-${columnIndex}`}
            className="flex items-center justify-between gap-1 rounded-md bg-column/90 px-2 py-1 ring-1 ring-slate-200/60"
          >
            <span className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-slate-500">
              {resolveColumnDisplayTitle(columnTitleOverrides, columnIndex)}
            </span>
            {columnIndex === 0 ? (
              <button
                type="button"
                onClick={onAddRootCard}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-white hover:text-sky-700"
                title="Neue Wurzelkarte"
                aria-label="Neue Wurzelkarte"
              >
                <Plus className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <div className="relative">
        <MindmapConnectors layout={layout} rowHeights={rowHeights} />
        <div
          className="relative z-10 rounded-lg bg-column/40 ring-1 ring-slate-200/50"
          style={{ width: boardWidth, height: Math.max(boardHeight, MINDMAP_BOARD_PAD_Y * 2 + 40) }}
        >
          {cardRows.map(({ entry: e, pos, previewHere }) => (
            <div
              key={e.node.id}
              ref={cardRef(e.node.id)}
              className="absolute z-10 px-0.5"
              style={{
                left: pos.left,
                top: pos.top,
                width: pos.width,
              }}
            >
              <TaskCard
                node={e.node}
                columnIndex={e.column}
                listParentId={e.listParentId}
                isSearchFocus={searchFocusNodeId === e.node.id}
                isNestDropTarget={
                  previewHere?.intent === "nest-under" && previewHere.anchorCardId === e.node.id
                }
                isBranchCollapsed={collapsedIds.has(e.node.id)}
                onToggleCollapsed={() => onToggleCollapsed(e.node.id)}
                isTitleEditing={titleEditNodeId === e.node.id}
                onTitleSave={(t, meta) => onTitleSave(e.node.id, t, meta)}
                onTitleEditCancel={() => onTitleEditCancel(e.node.id)}
                onAddChild={() => onAddChildCard(e.node.id)}
                onOpenDetails={() => onOpenDetails(e.node.id)}
                fieldVisibility={fieldVisibility}
                onOpenBranch={() => onActivateBranch(e.node.id)}
                onCopySubtree={onCopySubtree ? () => onCopySubtree(e.node) : undefined}
                onPasteSubtreeUnder={() => onPasteSubtreeUnder(e.node.id)}
                onRequestDelete={
                  onRequestDelete ? () => onRequestDelete(e.node.id) : undefined
                }
              />
            </div>
          ))}
          {gapSlots.map(({ key, columnIndex, insertIndex, listParentId, left, width, zone, highlightColumn }) => (
            <GridInsertGap
              key={key}
              columnIndex={columnIndex}
              insertIndex={insertIndex}
              listParentId={listParentId}
              showLine={gapLineAt(columnIndex, insertIndex, listParentId)}
              highlightColumn={highlightColumn}
              style={{
                left,
                ...zone,
                width,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
