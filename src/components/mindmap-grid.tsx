"use client";

import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { resolveColumnDisplayTitle } from "@/lib/column-titles";
import {
  layoutMindmap,
  MINDMAP_BOARD_PAD_Y,
  MINDMAP_COL_GAP_PX,
  MINDMAP_COL_WIDTH_PX,
  type MindmapDropGap,
} from "@/lib/mindmap-layout";
import { columnGapId } from "@/lib/tree-utils";
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
  gap,
  showLine,
  highlightColumn,
}: {
  gap: MindmapDropGap;
  showLine: boolean;
  highlightColumn: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnGapId(gap.columnIndex, gap.insertIndex, gap.listParentId),
    data: {
      kind: "columnGap" as const,
      columnIndex: gap.columnIndex,
      insertIndex: gap.insertIndex,
      listParentId: gap.listParentId,
    },
  });

  const style: CSSProperties = {
    left: gap.left,
    top: gap.top,
    width: gap.width,
    height: gap.height,
  };

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

export interface MindmapGridProps {
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
  const [cardHeights, setCardHeights] = useState<Map<string, number>>(() => new Map());
  const cardElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());

  const measureCardElement = useCallback((el: HTMLDivElement): number => {
    const card = el.querySelector<HTMLElement>("[data-task-card-id]");
    const h = card?.offsetHeight ?? el.offsetHeight;
    return Math.max(Math.ceil(h), 1);
  }, []);

  const publishCardHeights = useCallback(() => {
    const next = new Map<string, number>();
    for (const [id, el] of cardElementsRef.current) {
      next.set(id, measureCardElement(el));
    }
    setCardHeights((prev) => {
      if (prev.size !== next.size) return next;
      for (const [id, h] of next) {
        if (prev.get(id) !== h) return next;
      }
      return prev;
    });
  }, [measureCardElement]);

  const observeCard = useCallback((nodeId: string, el: HTMLDivElement | null) => {
    if (el) {
      cardElementsRef.current.set(nodeId, el);
      return;
    }
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

  const collapsedSet = useMemo(() => collapsedIds, [collapsedIds]);

  const { layout, positions, dropGaps, boardHeight, boardWidth } = useMemo(
    () => layoutMindmap(roots, collapsedSet, cardHeights),
    [roots, collapsedSet, cardHeights],
  );

  useEffect(() => {
    const ro = new ResizeObserver(() => publishCardHeights());
    for (const el of cardElementsRef.current.values()) ro.observe(el);
    publishCardHeights();
    return () => ro.disconnect();
  }, [publishCardHeights, layout.entries, fieldVisibility, titleEditNodeId]);

  const headerGridStyle = useMemo(
    () => ({
      gridTemplateColumns: `repeat(${columnCount}, ${MINDMAP_COL_WIDTH_PX}px)`,
      columnGap: `${MINDMAP_COL_GAP_PX}px`,
    }),
    [columnCount],
  );

  const gapLineAt = (gap: MindmapDropGap) => {
    if (!dropPreview || dropPreview.toCol !== gap.columnIndex || dropPreview.targetMode !== "column") {
      return false;
    }
    const sortIntent =
      dropPreview.intent === "reorder-gap" ||
      dropPreview.intent === "column-end" ||
      dropPreview.intent === "reorder-sibling" ||
      dropPreview.intent === "root-sibling";
    if (!sortIntent) return false;
    return (
      dropPreview.insertIndex === gap.insertIndex &&
      (dropPreview.gapListParentId === undefined || dropPreview.gapListParentId === gap.listParentId)
    );
  };

  const isMainTailHighlight = (gap: MindmapDropGap) =>
    gap.columnIndex === 0 &&
    gap.listParentId === null &&
    dropPreview?.intent === "column-end" &&
    dropPreview.insertIndex === gap.insertIndex &&
    (dropPreview.gapListParentId === undefined || dropPreview.gapListParentId === null);

  const cardRows = useMemo(
    () =>
      layout.entries.flatMap((entry) => {
        const pos = positions.get(entry.node.id);
        if (!pos) return [];
        const previewHere =
          dropPreview && dropPreview.toCol === entry.column ? dropPreview : null;
        return [{ entry, pos, previewHere }];
      }),
    [layout.entries, positions, dropPreview],
  );

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
        <MindmapConnectors layout={layout} positions={positions} />
        <div
          className="relative z-10 rounded-lg bg-column/40 ring-1 ring-slate-200/50"
          style={{ width: boardWidth, height: Math.max(boardHeight, MINDMAP_BOARD_PAD_Y * 2 + 40) }}
        >
          {cardRows.map(({ entry, pos, previewHere }) => (
            <div
              key={entry.node.id}
              ref={cardRef(entry.node.id)}
              className="absolute z-10 px-0.5"
              style={{ left: pos.left, top: pos.top, width: pos.width }}
            >
              <TaskCard
                node={entry.node}
                columnIndex={entry.column}
                listParentId={entry.listParentId}
                isSearchFocus={searchFocusNodeId === entry.node.id}
                isNestDropTarget={
                  previewHere?.intent === "nest-under" && previewHere.anchorCardId === entry.node.id
                }
                isBranchCollapsed={collapsedIds.has(entry.node.id)}
                onToggleCollapsed={() => onToggleCollapsed(entry.node.id)}
                isTitleEditing={titleEditNodeId === entry.node.id}
                onTitleSave={(t, meta) => onTitleSave(entry.node.id, t, meta)}
                onTitleEditCancel={() => onTitleEditCancel(entry.node.id)}
                onAddChild={() => onAddChildCard(entry.node.id)}
                onOpenDetails={() => onOpenDetails(entry.node.id)}
                fieldVisibility={fieldVisibility}
                onOpenBranch={() => onActivateBranch(entry.node.id)}
                onCopySubtree={onCopySubtree ? () => onCopySubtree(entry.node) : undefined}
                onPasteSubtreeUnder={() => onPasteSubtreeUnder(entry.node.id)}
                onRequestDelete={
                  onRequestDelete ? () => onRequestDelete(entry.node.id) : undefined
                }
              />
            </div>
          ))}
          {dropGaps.map((gap) => (
            <GridInsertGap
              key={`${gap.columnIndex}-${gap.insertIndex}-${gap.listParentId ?? "root"}-${gap.top}`}
              gap={gap}
              showLine={gapLineAt(gap)}
              highlightColumn={isMainTailHighlight(gap)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
