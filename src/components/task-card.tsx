"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, ListPlus, Pencil, Trash2, FileDown } from "lucide-react";
import { type FocusEvent, useId, type PointerEvent } from "react";

import { aggregateEffort, aggregateNextDue, formatDueHint } from "@/lib/aggregates";
import type { CardFieldVisibility } from "@/lib/card-field-visibility";
import { tagChipClass } from "@/lib/task-tags";
import { useTaskTreeStore } from "@/store/task-tree-store";
import type { TaskNode } from "@/types/task-node";

/** Klick-/Pointer-Ziel als Element (Textknoten → Elternelement). */
function eventTargetElement(target: EventTarget | null): Element | null {
  if (!target) return null;
  if (target instanceof Element) return target;
  if (target instanceof Text) return target.parentElement;
  return null;
}

function isInsideInteractiveControl(el: Element): boolean {
  return Boolean(el.closest("button, a, input, textarea, select, [contenteditable='true'], [role='button']"));
}

function hasVisibleMetaLine(
  visibility: CardFieldVisibility,
  node: TaskNode,
  showRollup: boolean,
  rollupDue: Date | null,
  effortOnTasksEnabled: boolean,
): boolean {
  const effortVisible =
    effortOnTasksEnabled && visibility.effort && (showRollup || node.effort > 0);
  const dueVisible = visibility.dueDate && Boolean(formatDueHint(rollupDue));
  const reminderVisible = visibility.reminderDate && Boolean(node.reminderDate);
  return effortVisible || dueVisible || reminderVisible;
}

const btnClass =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded border border-transparent text-slate-400 hover:bg-white hover:text-slate-700";

export interface TaskCardProps {
  node: TaskNode;
  columnIndex: number;
  /** Parent der Geschwisterliste dieser Karte (`null` = Wurzeln). Für DnD-Semantik. */
  listParentId: string | null;
  /** Diese Karte ist die aktuell „aufgeklappte“ in ihrer Spalte (pathIds[columnIndex]). */
  isDrilledHere: boolean;
  /** Karte liegt irgendwo auf der aktiven Drill-Down-Kette. */
  isOnActivePath: boolean;
  /** Karte liegt auf dem aktuellen Zweig (Pfad + Teilbaum unter letztem Pfad-Knoten). */
  branchHighlight?: boolean;
  /** Maus-Hover: Karte gehört zum hervorgehobenen Teilbaum unter der gehoverten Karte. */
  hoverSubtreeHighlight?: boolean;
  /** Diese Karte ist das aktuelle Karten-Drop-Ziel (nur bei targetMode card). */
  isCardDropTarget?: boolean;
  /** Sichtbare Kartenfelder (außer Titel). */
  fieldVisibility: CardFieldVisibility;
  onAddChild: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Teilbaum als JSON-Datei exportieren (optional). */
  onExportSubtree?: () => void;
  /** Teilbaum-JSON anzeigen und kopieren (optional). */
  onCopySubtreeJson?: () => void;
  /** Bei Fokus von außen: Drill-Pfad bis zu dieser Karte setzen (Ast aktivieren). */
  onFocusActivateBranch?: () => void;
  /** Maus betritt die Karte — Teilbaum-Hervorhebung starten. */
  onHoverSubtreeEnter?: () => void;
  /** Maus verlässt die Karte — Hervorhebung zeitverzögert beenden. */
  onHoverSubtreeLeave?: () => void;
}

export function TaskCard({
  node,
  columnIndex,
  listParentId,
  isDrilledHere,
  isOnActivePath,
  branchHighlight = false,
  hoverSubtreeHighlight = false,
  isCardDropTarget = false,
  fieldVisibility,
  onAddChild,
  onEdit,
  onDelete,
  onExportSubtree,
  onCopySubtreeJson,
  onFocusActivateBranch,
  onHoverSubtreeEnter,
  onHoverSubtreeLeave,
}: TaskCardProps) {
  const effortOnTasksEnabled = useTaskTreeStore((s) => s.effortOnTasksEnabled);
  const cardHeadingId = useId();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
    data: { columnIndex, kind: "card" as const, listParentId },
  });

  const rollupEffort = aggregateEffort(node);
  const rollupDue = aggregateNextDue(node);
  const hasChildren = node.children.length > 0;
  const showRollup = hasChildren;

  const desc = node.description?.trim() ?? "";
  const hasDescription = Boolean(desc) && fieldVisibility.description;
  const hasMetaLine = hasVisibleMetaLine(
    fieldVisibility,
    node,
    showRollup,
    rollupDue,
    effortOnTasksEnabled,
  );
  const showEffortMeta = effortOnTasksEnabled && fieldVisibility.effort;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleFocusIn = (e: FocusEvent<HTMLElement>) => {
    const root = e.currentTarget;
    const prev = e.relatedTarget as Node | null;
    if (prev && root.contains(prev)) return;
    onFocusActivateBranch?.();
  };

  const tryFocusCardFromPointer = (e: PointerEvent<HTMLElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = eventTargetElement(e.target);
    if (!el || !e.currentTarget.contains(el)) return;
    if (isInsideInteractiveControl(el)) return;
    e.currentTarget.focus({ preventScroll: false });
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      tabIndex={-1}
      aria-labelledby={cardHeadingId}
      onPointerDown={tryFocusCardFromPointer}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") onHoverSubtreeEnter?.();
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") onHoverSubtreeLeave?.();
      }}
      onFocusCapture={handleFocusIn}
      className={[
        "group relative scroll-my-1 rounded-md border px-1.5 py-1 shadow-sm transition outline-none focus:ring-2 focus:ring-sky-400/70 focus:ring-offset-1 focus-visible:ring-2 focus-visible:ring-sky-400/80 focus-visible:ring-offset-1",
        isCardDropTarget
          ? "border-slate-300/90 bg-slate-300/95"
          : hoverSubtreeHighlight
            ? "border-slate-300/80 bg-white shadow-sm ring-1 ring-slate-200/50"
            : branchHighlight
              ? "border-sky-200/75 bg-sky-50/85 shadow-sm ring-1 ring-sky-100/35"
              : "border-slate-200/80 bg-white",
        isDragging ? "opacity-60 ring-2 ring-sky-200" : "opacity-100",
        !isCardDropTarget && isDrilledHere
          ? "border-sky-400 ring-2 ring-sky-100"
          : !isCardDropTarget && isOnActivePath
            ? "border-violet-200 ring-1 ring-violet-100"
            : "",
      ].join(" ")}
    >
      <div className="flex gap-1.5">
        <button
          type="button"
          className={`${btnClass} mt-0.5 shrink-0 self-start text-slate-400 hover:border-slate-200`}
          aria-label="Karte verschieben"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-start justify-between gap-1.5">
            <h3
              id={cardHeadingId}
              className="line-clamp-2 min-w-0 flex-1 break-words text-xs font-semibold leading-tight text-slate-900"
            >
              {node.title.trim() ? node.title : <span className="font-normal text-slate-400">(Ohne Titel)</span>}
            </h3>
          </div>

          {fieldVisibility.tags && node.tags.length > 0 ? (
            <div className="flex flex-wrap gap-0.5">
              {node.tags.map((t) => (
                <span
                  key={t}
                  className={[
                    "rounded px-1 py-px text-[9px] font-medium leading-none ring-1",
                    tagChipClass(t),
                  ].join(" ")}
                >
                  {t}
                </span>
              ))}
            </div>
          ) : null}

          {hasDescription ? (
            <p className="whitespace-pre-wrap break-words text-[11px] leading-snug text-slate-500">{desc}</p>
          ) : null}

          {hasMetaLine ? (
            <div className="flex max-w-full flex-nowrap items-center gap-x-2 overflow-x-auto text-[10px] text-slate-500 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {showEffortMeta && showRollup ? (
                <span className="shrink-0">
                  Σ <span className="font-medium text-slate-700">{rollupEffort}h</span>
                </span>
              ) : showEffortMeta && node.effort > 0 ? (
                <span className="shrink-0">
                  <span className="font-medium text-slate-700">{node.effort}h</span>
                </span>
              ) : null}
              {fieldVisibility.dueDate && formatDueHint(rollupDue) ? (
                <span className="shrink-0 whitespace-nowrap">
                  <span className="font-medium text-slate-700">{formatDueHint(rollupDue)}</span>
                </span>
              ) : null}
              {fieldVisibility.reminderDate && node.reminderDate ? (
                <span className="shrink-0 text-slate-500">
                  Erin.{" "}
                  <span className="font-medium text-slate-700">
                    {formatDueHint(node.reminderDate)}
                  </span>
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="mt-0.5 flex flex-wrap items-center gap-0.5 border-t border-slate-100/90 pt-0.5">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                onAddChild();
              }}
              className={`${btnClass} hover:border-sky-200 hover:text-sky-800`}
              title="Unterkarte anlegen"
              aria-label="Unterkarte anlegen"
            >
              <ListPlus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                onEdit();
              }}
              className={`${btnClass} hover:border-slate-200`}
              title="Bearbeiten"
              aria-label="Karte bearbeiten"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {onExportSubtree ? (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.preventDefault();
                  onExportSubtree();
                }}
                className={`${btnClass} hover:border-emerald-200 hover:text-emerald-800`}
                title="Teilbaum als JSON-Datei exportieren"
                aria-label="Teilbaum als JSON-Datei exportieren"
              >
                <FileDown className="h-3.5 w-3.5" />
              </button>
            ) : null}
            {onCopySubtreeJson ? (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.preventDefault();
                  onCopySubtreeJson();
                }}
                className={`${btnClass} hover:border-violet-200 hover:text-violet-800`}
                title="Teilbaum-JSON anzeigen und kopieren"
                aria-label="Teilbaum-JSON anzeigen und kopieren"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                onDelete();
              }}
              className={`${btnClass} hover:border-red-200 hover:text-red-700`}
              title="Löschen"
              aria-label="Karte löschen"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
