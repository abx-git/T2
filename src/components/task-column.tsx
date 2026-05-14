"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { Fragment } from "react";

import {
  columnGapId,
  getSiblingsList,
  listParentForColumn,
  siblingInsertIndexBeforeCard,
  type ColumnDisplayRow,
} from "@/lib/tree-utils";
import type { CardFieldVisibility } from "@/lib/card-field-visibility";
import type { BoardDropPreview } from "@/types/dnd-preview";
import type { TaskNode } from "@/types/task-node";

import { TaskCard } from "./task-card";

function DropSlotLine() {
  return (
    <div className="pointer-events-none relative z-30 py-1" aria-hidden>
      <div className="h-1 w-full rounded-full bg-sky-600 shadow-[0_0_0_2px_rgba(255,255,255,1)]" />
    </div>
  );
}

function ColumnInsertGap({
  columnIndex,
  insertIndex,
  listParentId,
  showLine,
  highlightColumn,
}: {
  columnIndex: number;
  insertIndex: number;
  listParentId: string | null;
  showLine: boolean;
  /** Hauptebene: End-Lücke — gleiche Flächen-Hervorhebung wie früher die große Drop-Zone. */
  highlightColumn: boolean;
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
        "relative z-10 min-h-[12px] shrink-0 rounded-md transition-colors",
        highlightColumn && isOver ? "min-h-[24px] bg-sky-100/90 ring-2 ring-sky-500" : "",
        !highlightColumn && isOver ? "bg-sky-50/80" : "",
      ].join(" ")}
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
  pathIds: string[];
  /** Knoten auf dem aktuellen Zweig (Hintergrund in Spaltenansicht). */
  branchNodeIds: Set<string>;
  onAddCard: (columnIndex: number) => void;
  onAddChildCard: (parentId: string) => void;
  onEditCard: (nodeId: string) => void;
  onDeleteCard: (nodeId: string) => void;
  /** Pfad bis zur fokussierten Karte setzen (Ast aktivieren). */
  onActivateBranch: (nodeId: string) => void;
  dropPreview: BoardDropPreview | null;
  fieldVisibility: CardFieldVisibility;
  onExportSubtree?: (node: TaskNode) => void;
  onCopySubtreeJson?: (node: TaskNode) => void;
}

export function TaskColumn({
  title,
  columnIndex,
  roots,
  rows,
  pathIds,
  branchNodeIds,
  onAddCard,
  onAddChildCard,
  onEditCard,
  onDeleteCard,
  onActivateBranch,
  dropPreview,
  fieldVisibility,
  onExportSubtree,
  onCopySubtreeJson,
}: TaskColumnProps) {
  const ids = rows.map((r) => r.node.id);
  const listLp = listParentForColumn(pathIds, columnIndex);
  const depthSliceColumn = pathIds.length > 0 && columnIndex > pathIds.length;
  const allowAddCard = columnIndex === 0 || columnIndex <= pathIds.length;

  const previewHere =
    dropPreview && dropPreview.toCol === columnIndex ? dropPreview : null;

  const gapLineAt = (insertIndex: number, gapLp: string | null) =>
    Boolean(
      previewHere &&
        previewHere.targetMode === "column" &&
        (previewHere.intent === "reorder-gap" || previewHere.intent === "column-end") &&
        previewHere.insertIndex === insertIndex &&
        (previewHere.gapListParentId === undefined || previewHere.gapListParentId === gapLp),
    );

  const siblingTailInsertIndex = () => getSiblingsList(roots, listLp).length;

  const mainTailHighlight = (insertIndex: number, gapLp: string | null) =>
    columnIndex === 0 &&
    gapLp === null &&
    Boolean(
      previewHere?.intent === "column-end" &&
        previewHere.insertIndex === insertIndex &&
        (previewHere.gapListParentId === undefined || previewHere.gapListParentId === null) &&
        (rows.length === 0 ? insertIndex === 0 : insertIndex === siblingTailInsertIndex()),
    );

  const renderUniformList = () => (
    <>
      {rows.length === 0 ? (
        <div className="flex min-h-[72px] flex-col">
          <ColumnInsertGap
            columnIndex={columnIndex}
            insertIndex={0}
            listParentId={listLp}
            showLine={gapLineAt(0, listLp)}
            highlightColumn={mainTailHighlight(0, listLp)}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          <ColumnInsertGap
            columnIndex={columnIndex}
            insertIndex={siblingInsertIndexBeforeCard(roots, rows[0].listParentId, rows[0].node.id)}
            listParentId={rows[0].listParentId}
            showLine={gapLineAt(
              siblingInsertIndexBeforeCard(roots, rows[0].listParentId, rows[0].node.id),
              rows[0].listParentId,
            )}
            highlightColumn={mainTailHighlight(
              siblingInsertIndexBeforeCard(roots, rows[0].listParentId, rows[0].node.id),
              rows[0].listParentId,
            )}
          />
          {rows.map((row, i) => (
            <Fragment key={row.node.id}>
              <div className="relative z-20">
                <TaskCard
                  node={row.node}
                  columnIndex={columnIndex}
                  listParentId={listLp}
                  isDrilledHere={pathIds[columnIndex] === row.node.id}
                  isOnActivePath={pathIds.includes(row.node.id)}
                  branchHighlight={branchNodeIds.has(row.node.id)}
                  isCardDropTarget={
                    Boolean(
                      previewHere?.targetMode === "card" && previewHere.anchorCardId === row.node.id,
                    )
                  }
                  onAddChild={() => onAddChildCard(row.node.id)}
                  onEdit={() => onEditCard(row.node.id)}
                  onDelete={() => onDeleteCard(row.node.id)}
                  fieldVisibility={fieldVisibility}
                  onFocusActivateBranch={() => onActivateBranch(row.node.id)}
                  onExportSubtree={
                    onExportSubtree ? () => onExportSubtree(row.node) : undefined
                  }
                  onCopySubtreeJson={
                    onCopySubtreeJson ? () => onCopySubtreeJson(row.node) : undefined
                  }
                />
              </div>
              <ColumnInsertGap
                columnIndex={columnIndex}
                insertIndex={
                  i + 1 < rows.length
                    ? siblingInsertIndexBeforeCard(roots, rows[i + 1].listParentId, rows[i + 1].node.id)
                    : getSiblingsList(roots, row.listParentId).length
                }
                listParentId={i + 1 < rows.length ? rows[i + 1].listParentId : row.listParentId}
                showLine={gapLineAt(
                  i + 1 < rows.length
                    ? siblingInsertIndexBeforeCard(roots, rows[i + 1].listParentId, rows[i + 1].node.id)
                    : getSiblingsList(roots, row.listParentId).length,
                  i + 1 < rows.length ? rows[i + 1].listParentId : row.listParentId,
                )}
                highlightColumn={mainTailHighlight(
                  i + 1 < rows.length
                    ? siblingInsertIndexBeforeCard(roots, rows[i + 1].listParentId, rows[i + 1].node.id)
                    : getSiblingsList(roots, row.listParentId).length,
                  i + 1 < rows.length ? rows[i + 1].listParentId : row.listParentId,
                )}
              />
            </Fragment>
          ))}
        </div>
      )}
    </>
  );

  const renderDepthSliceList = () => (
    <>
      {rows.length === 0 ? (
        <div className="flex min-h-[72px] flex-col">
          <ColumnInsertGap
            columnIndex={columnIndex}
            insertIndex={0}
            listParentId={listLp}
            showLine={gapLineAt(0, listLp)}
            highlightColumn={mainTailHighlight(0, listLp)}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          <ColumnInsertGap
            columnIndex={columnIndex}
            insertIndex={siblingInsertIndexBeforeCard(roots, rows[0].listParentId, rows[0].node.id)}
            listParentId={rows[0].listParentId}
            showLine={gapLineAt(
              siblingInsertIndexBeforeCard(roots, rows[0].listParentId, rows[0].node.id),
              rows[0].listParentId,
            )}
            highlightColumn={mainTailHighlight(
              siblingInsertIndexBeforeCard(roots, rows[0].listParentId, rows[0].node.id),
              rows[0].listParentId,
            )}
          />
          {rows.map((row, i) => (
            <Fragment key={row.node.id}>
              <div className="relative z-20">
                <TaskCard
                  node={row.node}
                  columnIndex={columnIndex}
                  listParentId={row.listParentId}
                  isDrilledHere={pathIds[columnIndex] === row.node.id}
                  isOnActivePath={pathIds.includes(row.node.id)}
                  branchHighlight={branchNodeIds.has(row.node.id)}
                  isCardDropTarget={
                    Boolean(
                      previewHere?.targetMode === "card" && previewHere.anchorCardId === row.node.id,
                    )
                  }
                  onAddChild={() => onAddChildCard(row.node.id)}
                  onEdit={() => onEditCard(row.node.id)}
                  onDelete={() => onDeleteCard(row.node.id)}
                  fieldVisibility={fieldVisibility}
                  onFocusActivateBranch={() => onActivateBranch(row.node.id)}
                  onExportSubtree={
                    onExportSubtree ? () => onExportSubtree(row.node) : undefined
                  }
                  onCopySubtreeJson={
                    onCopySubtreeJson ? () => onCopySubtreeJson(row.node) : undefined
                  }
                />
              </div>
              <ColumnInsertGap
                columnIndex={columnIndex}
                insertIndex={
                  i + 1 < rows.length
                    ? siblingInsertIndexBeforeCard(roots, rows[i + 1].listParentId, rows[i + 1].node.id)
                    : getSiblingsList(roots, row.listParentId).length
                }
                listParentId={i + 1 < rows.length ? rows[i + 1].listParentId : row.listParentId}
                showLine={gapLineAt(
                  i + 1 < rows.length
                    ? siblingInsertIndexBeforeCard(roots, rows[i + 1].listParentId, rows[i + 1].node.id)
                    : getSiblingsList(roots, row.listParentId).length,
                  i + 1 < rows.length ? rows[i + 1].listParentId : row.listParentId,
                )}
                highlightColumn={mainTailHighlight(
                  i + 1 < rows.length
                    ? siblingInsertIndexBeforeCard(roots, rows[i + 1].listParentId, rows[i + 1].node.id)
                    : getSiblingsList(roots, row.listParentId).length,
                  i + 1 < rows.length ? rows[i + 1].listParentId : row.listParentId,
                )}
              />
            </Fragment>
          ))}
        </div>
      )}
    </>
  );

  return (
    <section className="flex min-h-0 w-72 shrink-0 flex-col rounded-xl bg-column/90 p-2 shadow-sm ring-1 ring-slate-200/60 transition-shadow">
      <header className="mb-2 flex shrink-0 items-center justify-between gap-1 px-1">
        <h2 className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          {allowAddCard ? (
            <button
              type="button"
              onClick={() => onAddCard(columnIndex)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-white hover:text-sky-700"
              title="Neue Karte in dieser Spalte"
              aria-label="Neue Karte in dieser Spalte"
            >
              <Plus className="h-4 w-4" />
            </button>
          ) : null}
          <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            {rows.length}
          </span>
        </div>
      </header>

      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain rounded-lg p-0.5 scroll-py-2 outline-none [-webkit-overflow-scrolling:touch] focus-visible:ring-2 focus-visible:ring-sky-400/50 focus-visible:ring-offset-1"
          role="region"
          aria-label={`${title}: Kartenliste`}
          title="Maus: Rad scrollen. Tastatur: Fokus hier (Tab), dann Pfeiltasten, Bild auf/ab, Pos1/Ende."
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            const el = e.currentTarget;
            const step = 48;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              el.scrollBy({ top: step, behavior: "smooth" });
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              el.scrollBy({ top: -step, behavior: "smooth" });
            } else if (e.key === "PageDown") {
              e.preventDefault();
              el.scrollBy({ top: el.clientHeight * 0.9, behavior: "smooth" });
            } else if (e.key === "PageUp") {
              e.preventDefault();
              el.scrollBy({ top: -el.clientHeight * 0.9, behavior: "smooth" });
            } else if (e.key === "Home") {
              e.preventDefault();
              el.scrollTo({ top: 0, behavior: "smooth" });
            } else if (e.key === "End") {
              e.preventDefault();
              el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
            }
          }}
        >
          {depthSliceColumn ? renderDepthSliceList() : renderUniformList()}
        </div>
      </SortableContext>
    </section>
  );
}
