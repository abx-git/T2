"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  ChevronDown,
  ChevronRight,
  Circle,
  CircleCheck,
  ClipboardPaste,
  Copy,
  GripVertical,
  List,
  ListPlus,
  MoreHorizontal,
  Pencil,
  Target,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
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
  getNextChildMilestonePreview,
  isDueOverdue,
} from "@/lib/aggregates";
import type { CardFieldVisibility } from "@/lib/card-field-visibility";
import { cardColorClass } from "@/lib/card-color";
import { taskLinkHref } from "@/lib/task-link";
import { criticalPathTotals, formatCriticalPathHint } from "@/lib/critical-path";
import {
  aggregateOpenEffortTotals,
  effortTotalsIsEmpty,
  formatEffortTotals,
  getEffectiveEffortTotals,
  getEffortSource,
  rollupDisplayTotals,
} from "@/lib/task-effort";
import {
  isTaskMarkedDone,
  isTaskMilestone,
  setCompletedTagOnTags,
  tagChipClass,
  tagsWithoutCompletedTag,
} from "@/lib/task-tags";
import { isCoarsePointerDevice } from "@/lib/coarse-pointer";
import { formatTaskIdForDisplay } from "@/lib/task-id";
import { useTaskTreeStore } from "@/store/task-tree-store";
import type { TaskNode } from "@/types/task-node";

const CARD_CLICK_DELAY_MS = 280;

type CardMenuAnchor = { top: number; left: number; fromCursor: boolean };

function isInteractiveCardTarget(target: EventTarget | null): boolean {
  if (!target) return false;
  const el =
    target instanceof Element ? target : target instanceof Text ? target.parentElement : null;
  return Boolean(
    el?.closest("button, input, textarea, select, a, [role='menu'], [role='menuitem']"),
  );
}

function hasVisibleMetaLine(
  visibility: CardFieldVisibility,
  node: TaskNode,
  showRollup: boolean,
  rollupDue: Date | null,
  rollupOverdue: Date | null,
  effortOnTasksEnabled: boolean,
  milestonePreview: ReturnType<typeof getNextChildMilestonePreview>,
  criticalPathHint: string | null,
  completedTag: string,
): boolean {
  const ownEffort = getEffectiveEffortTotals(node, completedTag);
  const effortVisible =
    effortOnTasksEnabled &&
    visibility.effort &&
    (showRollup || !effortTotalsIsEmpty(ownEffort));
  const dueVisible =
    visibility.dueDate && Boolean(formatDueHint(rollupOverdue ?? rollupDue));
  const reminderVisible = visibility.reminderDate && Boolean(node.reminderDate);
  const milestoneVisible = Boolean(milestonePreview);
  const cpVisible = effortOnTasksEnabled && visibility.effort && Boolean(criticalPathHint);
  return effortVisible || dueVisible || reminderVisible || milestoneVisible || cpVisible;
}

const iconBtnClass =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded border border-transparent text-slate-400 transition hover:bg-white hover:text-slate-700";

const dragHandleClass =
  "flex h-7 w-6 shrink-0 touch-none items-center justify-center rounded border border-transparent text-slate-400 transition hover:border-slate-200 hover:bg-slate-50 hover:text-slate-600 active:cursor-grabbing";

const addChildBtnClass =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-sky-200/90 bg-sky-50 text-sky-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-100";

const cardMenuItemClass =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-slate-700 hover:bg-slate-50";

const cardMenuItemDangerClass =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-red-700 hover:bg-red-50";

const cardMenuPanelClass =
  "fixed z-[80] min-w-[10rem] rounded-md border border-slate-200 bg-white py-0.5 shadow-lg ring-1 ring-slate-900/5";

export type TaskTitleSaveMeta = { addSiblingAfter?: boolean };

export interface TaskCardProps {
  node: TaskNode;
  columnIndex: number;
  /** Parent der Geschwisterliste dieser Karte (`null` = Wurzeln). Für DnD-Semantik. */
  listParentId: string | null;
  /** Aktueller Suchtreffer (Hervorhebung). */
  isSearchFocus?: boolean;
  /** Tastatur-Fokus für Pfeilnavigation. */
  isKeyboardFocus?: boolean;
  onKeyboardFocus?: () => void;
  /** Ziel für „als Unterkarte einhängen“ (nicht für Sortieren). */
  isNestDropTarget?: boolean;
  /** Sichtbare Kartenfelder (außer Titel). */
  fieldVisibility: CardFieldVisibility;
  isTitleEditing?: boolean;
  onTitleSave?: (title: string, meta?: TaskTitleSaveMeta) => void;
  onTitleEditCancel?: () => void;
  onAddChild: () => void;
  /** Detail-Dialog öffnen. */
  onOpenDetails: () => void;
  /** Zweig exportieren (Format + Attribute). */
  onCopySubtree?: () => void;
  /** Teilbaum-JSON als Kind dieser Karte einfügen. */
  onPasteSubtreeUnder?: () => void;
  /** Zeilenliste als Kind(er) dieser Karte einfügen. */
  onPasteListUnder?: () => void;
  /** Drill-Pfad bis zu dieser Karte (Kinder-Spalte öffnen). */
  onOpenBranch: () => void;
  /** Löschen (mit Bestätigung im Board). */
  onRequestDelete?: () => void;
  isBranchCollapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function TaskCard({
  node,
  columnIndex,
  listParentId,
  isSearchFocus = false,
  isKeyboardFocus = false,
  onKeyboardFocus,
  isNestDropTarget = false,
  fieldVisibility,
  isTitleEditing = false,
  onTitleSave,
  onTitleEditCancel,
  onAddChild,
  onOpenDetails,
  onCopySubtree,
  onPasteSubtreeUnder,
  onPasteListUnder,
  onOpenBranch,
  onRequestDelete,
  isBranchCollapsed = false,
  onToggleCollapsed,
}: TaskCardProps) {
  const openFocusMode = useTaskTreeStore((s) => s.openFocusMode);

  const effortOnTasksEnabled = useTaskTreeStore((s) => s.effortOnTasksEnabled);
  const completedTag = useTaskTreeStore((s) => s.completedTag);
  const updateCard = useTaskTreeStore((s) => s.updateCard);
  const cardHeadingId = useId();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const branchClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [titleDraft, setTitleDraft] = useState(node.title);
  const [coarsePointer, setCoarsePointer] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<CardMenuAnchor | null>(null);

  useEffect(() => {
    setCoarsePointer(isCoarsePointerDevice());
  }, []);

  useEffect(() => {
    if (isTitleEditing) {
      setTitleDraft(node.title);
      const focusInput = () => {
        const el = titleInputRef.current;
        el?.focus({ preventScroll: true });
        if (node.title.trim()) el?.select();
      };
      requestAnimationFrame(() => {
        focusInput();
        window.setTimeout(focusInput, 50);
      });
    }
  }, [isTitleEditing, node.id, node.title]);

  useEffect(() => {
    return () => {
      if (titleBlurTimerRef.current) clearTimeout(titleBlurTimerRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (!menuOpen || !menuAnchor || menuAnchor.fromCursor) return;
    const updateAnchor = () => {
      const anchor = menuRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setMenuAnchor({ top: rect.bottom + 4, left: rect.right, fromCursor: false });
    };
    updateAnchor();
    window.addEventListener("scroll", updateAnchor, true);
    window.addEventListener("resize", updateAnchor);
    return () => {
      window.removeEventListener("scroll", updateAnchor, true);
      window.removeEventListener("resize", updateAnchor);
    };
  }, [menuOpen, menuAnchor?.fromCursor]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocPointerDown = (e: globalThis.PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target) || menuPanelRef.current?.contains(target)) return;
      setMenuOpen(false);
      setMenuAnchor(null);
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) setMenuAnchor(null);
  }, [menuOpen]);

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: node.id,
    data: { columnIndex, kind: "card" as const, listParentId },
  });

  const { setNodeRef: setDropRef } = useDroppable({
    id: node.id,
    disabled: isDragging,
    data: { columnIndex, kind: "card" as const, listParentId },
  });

  const setNodeRef = useCallback(
    (el: HTMLElement | null) => {
      setDragRef(el);
      setDropRef(el);
    },
    [setDragRef, setDropRef],
  );

  useEffect(() => {
    return () => {
      if (branchClickTimerRef.current) clearTimeout(branchClickTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isDragging && branchClickTimerRef.current) {
      clearTimeout(branchClickTimerRef.current);
      branchClickTimerRef.current = null;
    }
  }, [isDragging]);

  const rollupTotals = rollupDisplayTotals(node, completedTag);
  const rollupOpenTotals = aggregateOpenEffortTotals(node, completedTag);
  const rollupDueOpen = aggregateNextDueOpen(node, completedTag);
  const rollupOverdue = aggregateOverdueDue(node, completedTag);
  const ownEffort = getEffectiveEffortTotals(node, completedTag);
  const effortIsCalculated = getEffortSource(node) === "calculated";
  const nodeIsDone = isTaskMarkedDone(node, completedTag);
  const visibleTags = tagsWithoutCompletedTag(node.tags, completedTag);

  const toggleDone = () => {
    updateCard(node.id, {
      tags: setCompletedTagOnTags(node.tags, completedTag, !nodeIsDone),
    });
  };
  const hasChildren = node.children.length > 0;
  const isNewTitleEdit = isTitleEditing && !node.title.trim();
  const cpTotals = hasChildren ? criticalPathTotals(node, completedTag) : ownEffort;
  const cpDeadline = rollupOverdue ?? rollupDueOpen;
  /** Blatt ohne Termin: nur Aufwand, kein KP (keine Projektion ab „jetzt“). */
  const showCriticalPath =
    !nodeIsDone &&
    effortOnTasksEnabled &&
    fieldVisibility.effort &&
    (hasChildren
      ? !effortTotalsIsEmpty(cpTotals) || !effortTotalsIsEmpty(rollupOpenTotals)
      : Boolean(cpDeadline) && !effortTotalsIsEmpty(ownEffort));
  const criticalPathHint = showCriticalPath
    ? formatCriticalPathHint(cpTotals, {
        deadline: cpDeadline,
        durationTotals: cpDeadline ? rollupOpenTotals : cpTotals,
      })
    : null;
  const dueShownInCriticalPath = Boolean(criticalPathHint && cpDeadline);
  const milestonePreview = getNextChildMilestonePreview(node, completedTag);
  const showRollup = hasChildren;
  const isMilestoneCard = isTaskMilestone(node);
  const isOverdueInTree = rollupOverdue !== null;
  const isOwnDueOverdue = isDueOverdue(node.dueDate, isTaskMarkedDone(node, completedTag));
  const displayDue = rollupOverdue ?? rollupDueOpen;

  const cardLink = taskLinkHref(node.link);
  const desc = node.description?.trim() ?? "";
  const hasDescription = Boolean(desc) && fieldVisibility.description;
  const showLinkMeta = Boolean(cardLink) && fieldVisibility.link;
  const hasMetaLine = hasVisibleMetaLine(
    fieldVisibility,
    node,
    showRollup,
    rollupDueOpen,
    rollupOverdue,
    effortOnTasksEnabled,
    milestonePreview,
    criticalPathHint,
    completedTag,
  );
  const showEffortMeta = effortOnTasksEnabled && fieldVisibility.effort;

  const commitTitle = (meta?: TaskTitleSaveMeta) => {
    if (titleBlurTimerRef.current) {
      clearTimeout(titleBlurTimerRef.current);
      titleBlurTimerRef.current = null;
    }
    onTitleSave?.(titleDraft, meta);
  };

  const handleTitleBlur = () => {
    if (coarsePointer) return;
    if (titleBlurTimerRef.current) clearTimeout(titleBlurTimerRef.current);
    titleBlurTimerRef.current = setTimeout(() => {
      titleBlurTimerRef.current = null;
      if (document.activeElement === titleInputRef.current) return;
      commitTitle();
    }, 120);
  };

  const onTitleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      commitTitle(e.shiftKey ? { addSiblingAfter: true } : undefined);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onTitleEditCancel?.();
    }
  };

  const scheduleOpenBranch = () => {
    if (branchClickTimerRef.current) clearTimeout(branchClickTimerRef.current);
    branchClickTimerRef.current = setTimeout(() => {
      branchClickTimerRef.current = null;
      onOpenBranch();
    }, CARD_CLICK_DELAY_MS);
  };

  const handleCardClick = (e: MouseEvent<HTMLElement>) => {
    if (isTitleEditing || isDragging) return;
    if (isInteractiveCardTarget(e.target)) return;
    onKeyboardFocus?.();
    if (!hasChildren) return;
    scheduleOpenBranch();
  };

  const handleCardPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (isTitleEditing) e.stopPropagation();
  };

  const handleCardDoubleClick = (e: MouseEvent<HTMLElement>) => {
    if (isTitleEditing || isDragging) return;
    if (isInteractiveCardTarget(e.target)) return;
    if (branchClickTimerRef.current) {
      clearTimeout(branchClickTimerRef.current);
      branchClickTimerRef.current = null;
    }
    e.preventDefault();
    onOpenDetails();
  };

  const openCardMenu = (anchor: CardMenuAnchor) => {
    setMenuAnchor(anchor);
    setMenuOpen(true);
  };

  const openCardMenuFromButton = () => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    openCardMenu({ top: rect.bottom + 4, left: rect.right, fromCursor: false });
  };

  const handleCardContextMenu = (e: MouseEvent<HTMLElement>) => {
    if (coarsePointer || isTitleEditing || isDragging) return;
    if (isInteractiveCardTarget(e.target)) return;
    e.preventDefault();
    openCardMenu({ top: e.clientY, left: e.clientX, fromCursor: true });
  };

  const userCardColorClass = cardColorClass(node.cardColor);
  const defaultCardSurfaceClass =
    userCardColorClass ?? "border-slate-200/80 bg-white";

  const cardActionMenu =
    menuOpen && menuAnchor ? (
      <div
        ref={menuPanelRef}
        role="menu"
        style={{
          top: menuAnchor.top,
          left: menuAnchor.left,
          ...(menuAnchor.fromCursor ? {} : { transform: "translateX(-100%)" }),
        }}
        className={cardMenuPanelClass}
      >
        <button
          type="button"
          role="menuitem"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen(false);
            onOpenDetails();
          }}
          className={cardMenuItemClass}
        >
          <Pencil className="h-3.5 w-3.5 shrink-0 text-sky-700" aria-hidden />
          Ändern
        </button>
        <button
          type="button"
          role="menuitem"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen(false);
            openFocusMode(node.id);
          }}
          className={cardMenuItemClass}
        >
          <Target className="h-3.5 w-3.5 shrink-0 text-violet-700" aria-hidden />
          Fokus-Modus
        </button>
        {onCopySubtree ? (
          <button
            type="button"
            role="menuitem"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(false);
              onCopySubtree();
            }}
            className={cardMenuItemClass}
          >
            <Copy className="h-3.5 w-3.5 shrink-0 text-violet-700" aria-hidden />
            Zweig exportieren
          </button>
        ) : null}
        {onPasteSubtreeUnder ? (
          <button
            type="button"
            role="menuitem"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(false);
              onPasteSubtreeUnder();
            }}
            className={cardMenuItemClass}
          >
            <ClipboardPaste className="h-3.5 w-3.5 shrink-0 text-violet-700" aria-hidden />
            Teilbaum einfügen
          </button>
        ) : null}
        {onPasteListUnder ? (
          <button
            type="button"
            role="menuitem"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(false);
              onPasteListUnder();
            }}
            className={cardMenuItemClass}
          >
            <List className="h-3.5 w-3.5 shrink-0 text-violet-700" aria-hidden />
            Liste einfügen
          </button>
        ) : null}
        {hasChildren && onToggleCollapsed ? (
          <button
            type="button"
            role="menuitem"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(false);
              onToggleCollapsed();
            }}
            className={cardMenuItemClass}
          >
            {isBranchCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-600" aria-hidden />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-600" aria-hidden />
            )}
            {isBranchCollapsed ? "Zweig aufklappen" : "Zweig zuklappen"}
          </button>
        ) : null}
        {onRequestDelete ? (
          <>
            <div className="my-0.5 border-t border-slate-100" role="separator" />
            <button
              type="button"
              role="menuitem"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen(false);
                onRequestDelete();
              }}
              className={cardMenuItemDangerClass}
            >
              <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Löschen
            </button>
          </>
        ) : null}
      </div>
    ) : null;

  return (
    <article
      ref={setNodeRef}
      data-task-card-id={node.id}
      tabIndex={isKeyboardFocus ? -1 : undefined}
      aria-labelledby={cardHeadingId}
      onClick={handleCardClick}
      onPointerDown={handleCardPointerDown}
      onDoubleClick={handleCardDoubleClick}
      onContextMenu={handleCardContextMenu}
      title={
        isTitleEditing
          ? undefined
          : hasChildren
            ? coarsePointer
              ? "Klick: Zweig zu-/aufklappen (nur nächste Ebene) · Doppelklick: Details · Griff (⋮⋮): Verschieben"
              : "Klick: Zweig zu-/aufklappen · Doppelklick: Details · Rechtsklick: Aktionen · Griff (⋮⋮): Verschieben"
            : coarsePointer
              ? "Doppelklick: Details · Griff (⋮⋮): Verschieben"
              : "Doppelklick: Details · Rechtsklick: Aktionen · Griff (⋮⋮): Verschieben"
      }
      className={[
        "group relative rounded-md border shadow-sm transition px-1.5 py-1",
        isTitleEditing ? "" : isDragging ? "cursor-grabbing" : "",
        isTitleEditing && !isNewTitleEdit ? "ring-2 ring-sky-300/80" : "",
        isNestDropTarget
          ? "border-violet-400/90 bg-violet-50/95 ring-2 ring-violet-300/80"
          : isOverdueInTree
            ? isOwnDueOverdue
              ? "border-red-300/90 bg-red-50/90 ring-1 ring-red-200/70"
              : "border-red-200/80 bg-red-50/40 ring-1 ring-red-100/50"
            : isMilestoneCard
              ? "border-amber-300/80 bg-amber-50/50 ring-1 ring-amber-200/60"
              : defaultCardSurfaceClass,
        isDragging ? "border-dashed border-sky-300/90 bg-sky-50/40 opacity-35 shadow-none" : "opacity-100",
        isSearchFocus ? "z-10 border-amber-400 bg-amber-50/90 ring-2 ring-amber-300/90" : "",
        isKeyboardFocus && !isSearchFocus
          ? "z-10 border-sky-400 bg-sky-50/80 ring-2 ring-sky-300/90"
          : "",
        isKeyboardFocus && isSearchFocus
          ? "z-10 border-amber-400 bg-amber-50/90 ring-2 ring-amber-300/90 ring-offset-2 ring-offset-sky-200"
          : "",
      ].join(" ")}
    >
      {isNestDropTarget ? (
        <span className="pointer-events-none absolute right-1 top-0.5 z-10 rounded bg-violet-600 px-1.5 py-px text-[9px] font-semibold leading-tight text-white shadow-sm">
          Unterkarte
        </span>
      ) : null}
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-0.5">
          <button
            type="button"
            className={dragHandleClass}
            aria-label="Karte verschieben"
            title="Ziehen zum Verschieben"
            {...attributes}
            {...listeners}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <GripVertical className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
          {fieldVisibility.completedCheck ? (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleDone();
              }}
              className={[
                iconBtnClass,
                nodeIsDone
                  ? "text-emerald-700 hover:border-emerald-200 hover:bg-emerald-50"
                  : "hover:border-emerald-200 hover:text-emerald-700",
              ].join(" ")}
              title={
                nodeIsDone
                  ? `Erledigt — Tag „${completedTag}“ entfernen`
                  : `Als erledigt markieren (Tag „${completedTag}“)`
              }
              aria-label={nodeIsDone ? "Als offen markieren" : "Als erledigt markieren"}
              aria-pressed={nodeIsDone}
            >
              {nodeIsDone ? (
                <CircleCheck className="h-3.5 w-3.5" strokeWidth={2.25} />
              ) : (
                <Circle className="h-3.5 w-3.5" strokeWidth={2} />
              )}
            </button>
          ) : null}

          {hasChildren ? (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (branchClickTimerRef.current) {
                  clearTimeout(branchClickTimerRef.current);
                  branchClickTimerRef.current = null;
                }
                onOpenBranch();
              }}
              className={iconBtnClass}
              title={isBranchCollapsed ? "Zweig aufklappen" : "Zweig einklappen"}
              aria-label={isBranchCollapsed ? "Zweig aufklappen" : "Zweig einklappen"}
              aria-expanded={!isBranchCollapsed}
            >
              {isBranchCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              )}
            </button>
          ) : null}

          <div
            className="min-w-0 flex-1 py-0.5"
            onClick={(e) => {
              if (isTitleEditing || coarsePointer) return;
              if (!hasChildren) return;
              e.stopPropagation();
              scheduleOpenBranch();
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {isTitleEditing ? (
              <input
                ref={titleInputRef}
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={onTitleKeyDown}
                onBlur={handleTitleBlur}
                onPointerDown={(e) => e.stopPropagation()}
                enterKeyHint="done"
                placeholder={
                  isNewTitleEdit
                    ? "Titel eingeben … (⇧↵ nächste Geschwisterkarte)"
                    : "Titel eingeben …"
                }
                aria-label="Kartentitel"
                className={
                  isNewTitleEdit
                    ? "w-full min-w-0 touch-manipulation rounded-sm border border-slate-200/80 bg-slate-50/50 px-0.5 py-0.5 text-xs font-semibold text-slate-800 outline-none placeholder:font-normal placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:ring-1 focus:ring-slate-200/90"
                    : "w-full min-w-0 touch-manipulation rounded border border-sky-300 bg-white px-1.5 py-1 text-base font-semibold text-slate-900 outline-none ring-2 ring-sky-400/50"
                }
              />
            ) : cardLink ? (
              <a
                id={cardHeadingId}
                href={cardLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className={[
                  "min-w-0 break-words px-0.5 text-xs font-semibold leading-tight text-sky-800 underline-offset-2 hover:underline line-clamp-2",
                  nodeIsDone ? "text-slate-500 line-through decoration-slate-400/80" : "",
                ].join(" ")}
                title={cardLink}
              >
                {node.title.trim() ? node.title : <span className="font-normal">(Ohne Titel)</span>}
              </a>
            ) : (
              <h3
                id={cardHeadingId}
                role={coarsePointer ? "button" : undefined}
                tabIndex={coarsePointer ? 0 : undefined}
                onClick={
                  coarsePointer
                    ? (e) => {
                        e.stopPropagation();
                        onOpenDetails();
                      }
                    : undefined
                }
                onKeyDown={
                  coarsePointer
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onOpenDetails();
                        }
                      }
                    : undefined
                }
                className={[
                  "min-w-0 break-words px-0.5 text-xs font-semibold leading-tight line-clamp-2",
                  coarsePointer ? "cursor-pointer touch-manipulation" : "",
                  nodeIsDone ? "text-slate-500 line-through decoration-slate-400/80" : "text-slate-900",
                ].join(" ")}
              >
                {node.title.trim() ? (
                  node.title
                ) : (
                  <span className="font-normal text-slate-400">(Ohne Titel)</span>
                )}
              </h3>
            )}
          </div>

          {coarsePointer ? (
            <div ref={menuRef} className="relative shrink-0 opacity-100 transition-opacity">
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (menuOpen) {
                    setMenuOpen(false);
                    setMenuAnchor(null);
                  } else {
                    openCardMenuFromButton();
                  }
                }}
                className={iconBtnClass}
                title="Weitere Aktionen"
                aria-label="Weitere Aktionen"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
          {typeof document !== "undefined" && cardActionMenu
            ? createPortal(cardActionMenu, document.body)
            : null}

          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openFocusMode(node.id);
            }}
            className={[
              iconBtnClass,
              "hover:border-violet-200 hover:bg-violet-50 hover:text-violet-800",
            ].join(" ")}
            title="Fokus-Modus — nur dieser Zweig"
            aria-label="Fokus-Modus öffnen"
          >
            <Target className="h-3.5 w-3.5" strokeWidth={2.1} aria-hidden />
          </button>

          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAddChild();
            }}
            className={addChildBtnClass}
            title="Unterkarte anlegen"
            aria-label="Unterkarte anlegen"
          >
            <ListPlus className="h-3.5 w-3.5" strokeWidth={2.25} />
          </button>
        </div>

        <div className="flex min-w-0 flex-col gap-0.5 pl-7">
          {fieldVisibility.id ? (
            <p
              className="font-mono text-[9px] leading-none tracking-wide text-slate-400"
              title={`Karten-ID: ${node.id}`}
            >
              {formatTaskIdForDisplay(node.id)}
            </p>
          ) : null}

          {fieldVisibility.tags && visibleTags.length > 0 ? (
            <div className="flex flex-wrap gap-0.5">
              {visibleTags.map((t) => (
                <span
                  key={t}
                  className={[
                    "rounded px-1 py-px text-[9px] font-medium leading-none ring-1",
                    tagChipClass(t, completedTag),
                  ].join(" ")}
                >
                  {t}
                </span>
              ))}
            </div>
          ) : null}

          {showLinkMeta ? (
            <p className="truncate text-[10px] leading-snug text-sky-700/90" title={cardLink!}>
              {cardLink}
            </p>
          ) : null}

          {hasDescription ? (
            <p
              className={[
                "overflow-hidden break-words text-[11px] leading-snug text-slate-500 line-clamp-2",
              ].join(" ")}
              title={desc}
            >
              {desc}
            </p>
          ) : null}

          {hasMetaLine ? (
            <div className="flex max-w-full flex-nowrap items-center gap-x-2 overflow-x-auto text-[10px] text-slate-500 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {showEffortMeta && showRollup && !effortTotalsIsEmpty(rollupTotals) ? (
                <span
                  className="shrink-0"
                  title={effortIsCalculated ? "Aufwand aus Kindern berechnet" : undefined}
                >
                  Σ{" "}
                  <span
                    className={[
                      "font-medium",
                      effortIsCalculated ? "text-violet-800" : "text-slate-700",
                    ].join(" ")}
                  >
                    {formatEffortTotals(rollupTotals)}
                  </span>
                </span>
              ) : showEffortMeta && !effortTotalsIsEmpty(ownEffort) ? (
                <span
                  className="shrink-0"
                  title={effortIsCalculated ? "Aufwand aus Kindern berechnet" : undefined}
                >
                  <span
                    className={[
                      "font-medium",
                      effortIsCalculated ? "text-violet-800" : "text-slate-700",
                    ].join(" ")}
                  >
                    {formatEffortTotals(ownEffort)}
                  </span>
                </span>
              ) : null}
              {criticalPathHint ? (
                <span
                  className="shrink-0 whitespace-nowrap text-violet-800"
                  title="Längster Aufwandsweg (kritischer Pfad); Werktage ohne Wochenende"
                >
                  {criticalPathHint}
                </span>
              ) : null}
              {fieldVisibility.dueDate && formatDueHint(displayDue) && !dueShownInCriticalPath ? (
                <span className="shrink-0 whitespace-nowrap">
                  {rollupOverdue ? (
                    <span className="font-medium text-red-700" title="Überfälliger Termin im Ast">
                      überfällig {formatDueHint(rollupOverdue)}
                    </span>
                  ) : (
                    <span className="font-medium text-slate-700">{formatDueHint(displayDue)}</span>
                  )}
                </span>
              ) : null}
              {rollupOverdue && dueShownInCriticalPath ? (
                <span className="shrink-0 whitespace-nowrap font-medium text-red-700" title="Überfälliger Termin im Ast">
                  überfällig {formatDueHint(rollupOverdue)}
                </span>
              ) : null}
              {milestonePreview ? (
                <span
                  className="shrink-0 whitespace-nowrap text-amber-900"
                  title="Aufwand offener Geschwister vor dem ersten Meilenstein"
                >
                  bis{" "}
                  <span className="font-medium">
                    {milestonePreview.milestone.title.trim() || "(Meilenstein)"}
                  </span>
                  {effortOnTasksEnabled ? (
                    <>
                      :{" "}
                      <span className="font-medium">
                        {formatEffortTotals(milestonePreview.effortBeforeMilestone)}
                      </span>
                    </>
                  ) : null}
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

        </div>
      </div>
    </article>
  );
}
