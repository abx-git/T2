"use client";

import type { ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import { ClipboardPaste, Plus } from "lucide-react";

import {
  columnGapId,
  getSiblingsList,
  listParentForColumn,
  siblingInsertIndexBeforeCard,
  type ColumnDisplayRow,
} from "@/lib/tree-utils";
import { MINDMAP_ROW_HEIGHT } from "@/lib/mindmap-layout";
import type { CardFieldVisibility } from "@/lib/card-field-visibility";
import type { BoardDropPreview } from "@/types/dnd-preview";
import type { TaskNode } from "@/types/task-node";

import { TaskCard } from "./task-card";

function DropSlotLine() {
  return (
    <div className="pointer-events-none relative z-30 py-1" aria-hidden>
      <div className="h-1.5 w-full rounded-full bg-sky-600 shadow-[0_0_0_2px_rgba(255,255,255,1)] ring-2 ring-sky-200/90" />
    </div>
  );
}

function ColumnInsertGap({
  columnIndex,
  insertIndex,
  listParentId,
  showLine,
  highlightColumn,
  topPx,
}: {
  columnIndex: number;
  insertIndex: number;
  listParentId: string | null;
  showLine: boolean;
  highlightColumn: boolean;
  topPx: number;
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
        "absolute left-0 right-0 z-10 min-h-[12px] shrink-0 rounded-md transition-colors",
        highlightColumn && isOver ? "min-h-[24px] bg-sky-100/90 ring-2 ring-sky-500" : "",
        !highlightColumn && isOver ? "bg-sky-50/80" : "",
      ].join(" ")}
      style={{ top: topPx }}
    >
      {showLine ? <DropSlotLine /> : <div className="h-1" aria-hidden />}
    </div>
  );
}

export interface TaskColumnProps {
  title: string;
  columnIndex: number;
  roots: TaskNode[];
  rows: ColumnDisplayRow[];
  totalRows: number;
  pathIds: string[];
  collapsedIds: Set<string>;
  searchFocusNodeId?: string | null;
  onAddCard: (columnIndex: number) => void;
  onPasteSubtree?: (columnIndex: number) => void;
  onAddChildCard: (parentId: string) => void;
  onOpenDetails: (nodeId: string) => void;
  onToggleCollapsed: (nodeId: string) => void;
  titleEditNodeId: string | null;
  onTitleSave: (nodeId: string, title: string, meta?: import("./task-card").TaskTitleSaveMeta) => void;
  onTitleEditCancel: (nodeId: string) => void;
  onActivateBranch: (nodeId: string) => void;
  dropPreview: BoardDropPreview | null;
  fieldVisibility: CardFieldVisibility;
  onCopySubtree?: (node: TaskNode) => void;
}

export function TaskColumn({
  title,
  columnIndex,
  roots,
  rows,
  totalRows,
  pathIds,
  collapsedIds,
  searchFocusNodeId = null,
  onAddCard,
  onPasteSubtree,
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
}: TaskColumnProps) {
  const listLp = listParentForColumn(pathIds, columnIndex);
  const allowAddCard = columnIndex === 0 || pathIds[columnIndex - 1] != null;

  const previewHere =
    dropPreview && dropPreview.toCol === columnIndex ? dropPreview : null;

  const gapLineAt = (insertIndex: number, gapLp: string | null) => {
    if (!previewHere || previewHere.targetMode !== "column") return false;
    const sortIntent =
      previewHere.intent === "reorder-gap" ||
      previewHere.intent === "column-end" ||
      previewHere.intent === "reorder-sibling" ||
      previewHere.intent === "root-sibling";
    if (!sortIntent) return false;
    return (
      previewHere.insertIndex === insertIndex &&
      (previewHere.gapListParentId === undefined || previewHere.gapListParentId === gapLp)
    );
  };

  const siblingTailInsertIndex = (listParentId: string | null) =>
    getSiblingsList(roots, listParentId).length;

  const mainTailHighlight = (insertIndex: number, gapLp: string | null) =>
    columnIndex === 0 &&
    gapLp === null &&
    Boolean(
      previewHere?.intent === "column-end" &&
        previewHere.insertIndex === insertIndex &&
        (previewHere.gapListParentId === undefined || previewHere.gapListParentId === null) &&
        (rows.length === 0
          ? insertIndex === 0
          : insertIndex === siblingTailInsertIndex(rows[rows.length - 1]?.listParentId ?? null)),
    );

  const canvasHeight = Math.max(totalRows, 1) * MINDMAP_ROW_HEIGHT;

  const renderPositioned = () => {
    if (rows.length === 0) {
      return (
        <ColumnInsertGap
          columnIndex={columnIndex}
          insertIndex={0}
          listParentId={listLp}
          showLine={gapLineAt(0, listLp)}
          highlightColumn={mainTailHighlight(0, listLp)}
          topPx={0}
        />
      );
    }

    const elements: ReactNode[] = [];

    rows.forEach((row, i) => {
      const insertBefore = siblingInsertIndexBeforeCard(roots, row.listParentId, row.node.id);
      const gapTop = row.slotStart * MINDMAP_ROW_HEIGHT;

      elements.push(
        <ColumnInsertGap
          key={`gap-before-${row.node.id}`}
          columnIndex={columnIndex}
          insertIndex={insertBefore}
          listParentId={row.listParentId}
          showLine={gapLineAt(insertBefore, row.listParentId)}
          highlightColumn={mainTailHighlight(insertBefore, row.listParentId)}
          topPx={gapTop}
        />,
      );

      elements.push(
        <div
          key={row.node.id}
          className="absolute left-0 right-0 z-20 px-0.5"
          style={{ top: row.ySlot * MINDMAP_ROW_HEIGHT }}
        >
          <TaskCard
            node={row.node}
            columnIndex={columnIndex}
            listParentId={row.listParentId}
            isSearchFocus={searchFocusNodeId === row.node.id}
            isNestDropTarget={
              previewHere?.intent === "nest-under" && previewHere.anchorCardId === row.node.id
            }
            isBranchCollapsed={collapsedIds.has(row.node.id)}
            onToggleCollapsed={() => onToggleCollapsed(row.node.id)}
            isTitleEditing={titleEditNodeId === row.node.id}
            onTitleSave={(t, meta) => onTitleSave(row.node.id, t, meta)}
            onTitleEditCancel={() => onTitleEditCancel(row.node.id)}
            onAddChild={() => onAddChildCard(row.node.id)}
            onOpenDetails={() => onOpenDetails(row.node.id)}
            fieldVisibility={fieldVisibility}
            onOpenBranch={() => onActivateBranch(row.node.id)}
            onCopySubtree={onCopySubtree ? () => onCopySubtree(row.node) : undefined}
          />
        </div>,
      );

      if (i === rows.length - 1) {
        const tailIndex = siblingTailInsertIndex(row.listParentId);
        const tailTop = row.slotEnd * MINDMAP_ROW_HEIGHT;
        elements.push(
          <ColumnInsertGap
            key={`gap-tail-${row.node.id}`}
            columnIndex={columnIndex}
            insertIndex={tailIndex}
            listParentId={row.listParentId}
            showLine={gapLineAt(tailIndex, row.listParentId)}
            highlightColumn={mainTailHighlight(tailIndex, row.listParentId)}
            topPx={tailTop}
          />,
        );
      }
    });

    return elements;
  };

  return (
    <section className="relative z-10 flex w-72 shrink-0 flex-col overflow-hidden rounded-xl bg-column/90 p-2 shadow-sm ring-1 ring-slate-200/60 transition-shadow">
      <header className="mb-2 flex shrink-0 items-center justify-between gap-1 px-1">
        <h2 className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          {allowAddCard ? (
            <>
              <button
                type="button"
                onClick={() => onAddCard(columnIndex)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-white hover:text-sky-700"
                title="Neue Karte in dieser Spalte"
                aria-label="Neue Karte in dieser Spalte"
              >
                <Plus className="h-4 w-4" />
              </button>
              {onPasteSubtree ? (
                <button
                  type="button"
                  onClick={() => onPasteSubtree(columnIndex)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-white hover:text-violet-700"
                  title="Teilbaum-JSON in diese Spalte einfügen"
                  aria-label="Teilbaum-JSON in diese Spalte einfügen"
                >
                  <ClipboardPaste className="h-4 w-4" />
                </button>
              ) : null}
            </>
          ) : null}
          <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            {rows.length}
          </span>
        </div>
      </header>

      <div
        className="relative min-h-[72px] rounded-lg p-0.5"
        role="region"
        aria-label={`${title}: Kartenliste`}
        style={{ height: canvasHeight }}
      >
        {renderPositioned()}
      </div>
    </section>
  );
}
