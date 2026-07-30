"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  ChevronRight,
  Circle,
  CircleCheck,
  Download,
  ExternalLink,
  FileStack,
  GripVertical,
  ListPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";

import {
  aggregateNextDueOpen,
  aggregateOverdueDue,
  formatDueHint,
  isDueOverdue,
} from "@/lib/aggregates";
import type { CardFieldVisibility } from "@/lib/card-field-visibility";
import {
  CARD_COLOR_OPTIONS,
  cardColorAccentClass,
  cardColorClass,
  type CardColorId,
} from "@/lib/card-color";
import { isCoarsePointerDevice } from "@/lib/coarse-pointer";
import {
  effortTotalsIsEmpty,
  formatEffortTotals,
  rollupDisplayTotals,
} from "@/lib/task-effort";
import { formatTaskIdForDisplay } from "@/lib/task-id";
import { taskLinkHref } from "@/lib/task-link";
import {
  isTaskMarkedDone,
  setCompletedTagOnTags,
  tagChipClass,
  tagsWithoutCompletedTag,
} from "@/lib/task-tags";
import { useTaskTreeStore } from "@/store/task-tree-store";
import type { TaskNode } from "@/types/task-node";

export type TaskTitleSaveMeta = { addSiblingAfter?: boolean };

const rowMenuItemClass =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-slate-700 hover:bg-slate-50";
const rowMenuItemDangerClass =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-red-700 hover:bg-red-50";
const rowMenuPanelClass =
  "fixed z-[80] min-w-[11rem] rounded-md border border-slate-200 bg-white py-0.5 shadow-lg ring-1 ring-slate-900/5";

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!target) return false;
  const el =
    target instanceof Element ? target : target instanceof Text ? target.parentElement : null;
  return Boolean(
    el?.closest("button, input, textarea, select, a, [role='menu'], [role='menuitem']"),
  );
}

export interface TaskRowProps {
  node: TaskNode;
  isSearchFocus?: boolean;
  isKeyboardFocus?: boolean;
  isNestDropTarget?: boolean;
  fieldVisibility: CardFieldVisibility;
  isTitleEditing?: boolean;
  onTitleSave?: (title: string, meta?: TaskTitleSaveMeta) => void;
  onTitleEditCancel?: () => void;
  onSelect: () => void;
  onDrillIn: () => void;
  onAddChild: () => void;
  onOpenDetails: () => void;
  onRequestExport?: () => void;
  onRequestInsertTemplate?: () => void;
  onRequestDelete?: () => void;
}

export function TaskRow({
  node,
  isSearchFocus = false,
  isKeyboardFocus = false,
  isNestDropTarget = false,
  fieldVisibility,
  isTitleEditing = false,
  onTitleSave,
  onTitleEditCancel,
  onSelect,
  onDrillIn,
  onAddChild,
  onOpenDetails,
  onRequestExport,
  onRequestInsertTemplate,
  onRequestDelete,
}: TaskRowProps) {
  const completedTag = useTaskTreeStore((s) => s.completedTag);
  const effortOnTasksEnabled = useTaskTreeStore((s) => s.effortOnTasksEnabled);
  const updateCard = useTaskTreeStore((s) => s.updateCard);
  const headingId = useId();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleEditStartedAtRef = useRef(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const [titleDraft, setTitleDraft] = useState(node.title);
  const [coarsePointer, setCoarsePointer] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: node.id,
    data: { kind: "contextCard" as const, nodeId: node.id },
    disabled: isTitleEditing,
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: node.id,
    data: { kind: "contextNest" as const, nodeId: node.id },
    disabled: isDragging,
  });

  const setRefs = useCallback(
    (el: HTMLElement | null) => {
      setNodeRef(el);
      setDropRef(el);
    },
    [setNodeRef, setDropRef],
  );

  useEffect(() => {
    setCoarsePointer(isCoarsePointerDevice());
  }, []);

  useEffect(() => {
    if (!isTitleEditing) return;
    setTitleDraft(node.title);
    titleEditStartedAtRef.current = Date.now();
    const focusInput = () => {
      const el = titleInputRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      if (node.title.trim()) el.select();
    };
    // Nach Layout (neue Karte ggf. erst gerendert) zuverlässig fokussieren.
    const t0 = window.setTimeout(focusInput, 0);
    const t1 = window.setTimeout(focusInput, 50);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [isTitleEditing, node.id]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: Event) => {
      const t = e.target as Node | null;
      if (menuRef.current?.contains(t) || menuPanelRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDoc, true);
    return () => document.removeEventListener("pointerdown", onDoc, true);
  }, [menuOpen]);

  const done = isTaskMarkedDone(node, completedTag);
  const hasChildren = node.children.length > 0;
  const cardLink = fieldVisibility.link ? taskLinkHref(node.link) : null;
  const rollupDue = aggregateNextDueOpen(node, completedTag);
  const rollupOverdue = aggregateOverdueDue(node, completedTag);
  const dueHint = fieldVisibility.dueDate
    ? formatDueHint(rollupOverdue ?? rollupDue)
    : null;
  const reminderHint = fieldVisibility.reminderDate
    ? formatDueHint(node.reminderDate)
    : null;
  const visibleTags = fieldVisibility.tags
    ? tagsWithoutCompletedTag(node.tags, completedTag)
    : [];
  const descriptionPreview = fieldVisibility.description
    ? node.description.trim().replace(/\s+/g, " ")
    : "";
  const effortTotals =
    fieldVisibility.effort && effortOnTasksEnabled
      ? rollupDisplayTotals(node, completedTag)
      : null;
  const effortLabel =
    effortTotals && !effortTotalsIsEmpty(effortTotals)
      ? formatEffortTotals(effortTotals)
      : "";
  const idLabel = fieldVisibility.id ? formatTaskIdForDisplay(node.id) : "";
  const showMeta =
    !isTitleEditing &&
    Boolean(
      dueHint ||
        reminderHint ||
        visibleTags.length > 0 ||
        descriptionPreview ||
        effortLabel ||
        idLabel ||
        cardLink,
    );

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const commitTitle = (meta?: TaskTitleSaveMeta) => {
    onTitleSave?.(titleDraft, meta);
  };

  const onTitleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitTitle(e.shiftKey ? { addSiblingAfter: true } : undefined);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onTitleEditCancel?.();
    }
  };

  const openMenu = (top: number, left: number) => {
    setMenuAnchor({ top, left });
    setMenuOpen(true);
  };

  const handleContextMenu = (e: MouseEvent) => {
    if (coarsePointer || isTitleEditing || isDragging) return;
    const el =
      e.target instanceof Element
        ? e.target
        : e.target instanceof Text
          ? e.target.parentElement
          : null;
    if (el?.closest("a, [role='menu'], [role='menuitem']")) return;
    e.preventDefault();
    onSelect();
    onOpenDetails();
  };

  const toggleDone = () => {
    updateCard(node.id, {
      tags: setCompletedTagOnTags(node.tags, completedTag, !done),
    });
  };

  const setCardColor = (color: CardColorId | undefined) => {
    updateCard(node.id, { cardColor: color });
  };

  const surface =
    cardColorClass(node.cardColor) ?? "border-slate-200/90 bg-white";
  const accent = cardColorAccentClass(node.cardColor);

  const menu =
    menuOpen && menuAnchor ? (
      <div
        ref={menuPanelRef}
        role="menu"
        style={{ top: menuAnchor.top, left: menuAnchor.left }}
        className={rowMenuPanelClass}
      >
        <div className="flex flex-wrap gap-1 px-2.5 py-1.5" role="group" aria-label="Farbe">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={!node.cardColor}
            className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 text-[8px]"
            onClick={() => setCardColor(undefined)}
          >
            —
          </button>
          {CARD_COLOR_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="menuitemradio"
              aria-checked={node.cardColor === opt.id}
              className={["h-5 w-5 rounded-full", opt.swatchClass].join(" ")}
              title={opt.label}
              onClick={() => setCardColor(opt.id)}
            />
          ))}
        </div>
        <div className="my-0.5 border-t border-slate-100" />
        <button
          type="button"
          role="menuitem"
          className={rowMenuItemClass}
          onClick={() => {
            setMenuOpen(false);
            onOpenDetails();
          }}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
          Ändern
        </button>
        {cardLink ? (
          <button
            type="button"
            role="menuitem"
            className={rowMenuItemClass}
            onClick={() => {
              setMenuOpen(false);
              window.open(cardLink, "_blank", "noopener,noreferrer");
            }}
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Link öffnen
          </button>
        ) : null}
        {onRequestExport ? (
          <button
            type="button"
            role="menuitem"
            className={rowMenuItemClass}
            onClick={() => {
              setMenuOpen(false);
              onRequestExport();
            }}
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Exportieren…
          </button>
        ) : null}
        {onRequestInsertTemplate ? (
          <button
            type="button"
            role="menuitem"
            className={rowMenuItemClass}
            onClick={() => {
              setMenuOpen(false);
              onRequestInsertTemplate();
            }}
          >
            <FileStack className="h-3.5 w-3.5" aria-hidden />
            Vorlage einfügen…
          </button>
        ) : null}
        {onRequestDelete ? (
          <button
            type="button"
            role="menuitem"
            className={rowMenuItemDangerClass}
            onClick={() => {
              setMenuOpen(false);
              onRequestDelete();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Löschen
          </button>
        ) : null}
      </div>
    ) : null;

  return (
    <article
      ref={setRefs}
      data-task-card-id={node.id}
      aria-labelledby={headingId}
      style={style}
      {...attributes}
      {...listeners}
      tabIndex={isKeyboardFocus ? -1 : undefined}
      onClick={(e) => {
        if (isInteractiveTarget(e.target) || isTitleEditing) return;
        onSelect();
      }}
      onDoubleClick={(e) => {
        if (isInteractiveTarget(e.target) || isTitleEditing) return;
        e.preventDefault();
        if (hasChildren) onDrillIn();
      }}
      onContextMenu={handleContextMenu}
      className={[
        "group relative flex touch-none cursor-grab items-stretch gap-1 rounded-lg border px-2 py-2 shadow-sm transition active:cursor-grabbing",
        surface,
        isDragging ? "opacity-40" : "",
        isNestDropTarget || isOver
          ? "border-violet-400 bg-violet-50/90 ring-2 ring-violet-300/70"
          : "",
        isSearchFocus ? "ring-2 ring-amber-300/90" : "",
        isKeyboardFocus && !isSearchFocus ? "ring-2 ring-sky-300/90" : "",
        isDueOverdue(rollupOverdue ?? null, done) ? "border-red-300/80" : "",
      ].join(" ")}
    >
      {accent ? (
        <span className={["absolute inset-y-0 left-0 w-1 rounded-l-lg", accent].join(" ")} aria-hidden />
      ) : null}

      <span
        className="mt-0.5 flex h-7 w-5 shrink-0 items-center justify-center text-slate-300 group-hover:text-slate-400"
        aria-hidden
        title="Ziehen zum Verschieben"
      >
        <GripVertical className="h-4 w-4" />
      </span>

      {fieldVisibility.completedCheck ? (
        <button
          type="button"
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-white hover:text-slate-700"
          aria-label={done ? "Als offen markieren" : "Als erledigt markieren"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            toggleDone();
          }}
        >
          {done ? (
            <CircleCheck className="h-4 w-4 text-emerald-600" aria-hidden />
          ) : (
            <Circle className="h-4 w-4" aria-hidden />
          )}
        </button>
      ) : null}

      <div className="min-w-0 flex-1">
        {isTitleEditing ? (
          <input
            ref={titleInputRef}
            id={headingId}
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onKeyDown={onTitleKeyDown}
            onBlur={() => {
              if (coarsePointer) return;
              // Kurz nach dem Öffnen: Fokus-Races (neue Karte) nicht als „fertig“ werten.
              if (Date.now() - titleEditStartedAtRef.current < 120) {
                window.setTimeout(() => {
                  titleInputRef.current?.focus({ preventScroll: true });
                }, 0);
                return;
              }
              commitTitle();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            autoFocus
            className="w-full rounded border border-sky-300 bg-white px-2 py-1 text-sm text-slate-900 outline-none ring-2 ring-sky-200"
            aria-label="Titel"
          />
        ) : (
          <h3
            id={headingId}
            className={[
              "w-full truncate text-left text-sm font-medium",
              done ? "text-slate-400 line-through" : "text-slate-900",
            ].join(" ")}
          >
            {node.title.trim() || "(Ohne Titel)"}
          </h3>
        )}
        {showMeta ? (
          <div className="mt-0.5 space-y-0.5">
            {descriptionPreview ? (
              <p className="truncate text-[11px] leading-snug text-slate-500">{descriptionPreview}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {dueHint ? (
                <span
                  className={[
                    "text-[10px]",
                    isDueOverdue(rollupOverdue ?? null, done) ? "font-medium text-red-600" : "text-slate-500",
                  ].join(" ")}
                  title="Fälligkeit"
                >
                  {dueHint}
                </span>
              ) : null}
              {reminderHint ? (
                <span className="text-[10px] text-amber-700/90" title="Erinnerung">
                  Erin. {reminderHint}
                </span>
              ) : null}
              {effortLabel ? (
                <span className="text-[10px] tabular-nums text-slate-500" title="Aufwand">
                  Σ {effortLabel}
                </span>
              ) : null}
              {idLabel ? (
                <span className="font-mono text-[10px] text-slate-400" title="Karten-ID">
                  {idLabel}
                </span>
              ) : null}
              {cardLink ? (
                <a
                  href={cardLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-[10px] text-sky-600 hover:text-sky-800"
                  title="Link öffnen"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3 w-3" aria-hidden />
                  Link
                </a>
              ) : null}
              {visibleTags.slice(0, 4).map((t) => (
                <span key={t} className={tagChipClass(t, completedTag)}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div
        className="flex shrink-0 items-start gap-0.5"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-sky-200/90 bg-sky-50 text-sky-700 hover:bg-sky-100"
          title="Unterkarte"
          aria-label="Unterkarte anlegen"
          onClick={(e) => {
            e.stopPropagation();
            onAddChild();
          }}
        >
          <ListPlus className="h-3.5 w-3.5" aria-hidden />
        </button>
        {hasChildren ? (
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
            title="Hinein"
            aria-label="In diese Karte hinein"
            onClick={(e) => {
              e.stopPropagation();
              onDrillIn();
            }}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
            <span className="sr-only">({node.children.length})</span>
          </button>
        ) : null}
        <div ref={menuRef}>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-50 hover:text-slate-700"
            aria-label="Aktionen"
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              openMenu(rect.bottom + 4, rect.right - 160);
            }}
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {typeof document !== "undefined" && menu ? createPortal(menu, document.body) : menu}
    </article>
  );
}
