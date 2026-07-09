"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragOverEvent,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  ChevronDown,
  ChevronRight,
  Circle,
  CircleCheck,
  Download,
  GripVertical,
  ListPlus,
  Pencil,
  Plus,
  Printer,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CardFieldVisibility } from "@/lib/card-field-visibility";
import {
  canInsertAtFocusGap,
  canNestUnderInFocus,
} from "@/lib/focus-mode-dnd";
import {
  buildFocusOutlineRows,
  columnIndexForSiblingList,
  computeFocusRowTreeGuides,
  countFocusSubtree,
  getFocusOutlineMaxDepth,
  type FocusOutlineRow,
} from "@/lib/focus-mode-outline";
import { findDirectParentId, findNodeById, pathFromRootToNode } from "@/lib/tree-utils";
import {
  downloadFocusOutlineMarkdown,
  downloadFocusOutlinePlainText,
  printFocusOutline,
} from "@/lib/focus-mode-export";
import { formatDueHint, isDueOverdue } from "@/lib/aggregates";
import {
  isTaskMarkedDone,
  setCompletedTagOnTags,
  tagChipClass,
  tagsWithoutCompletedTag,
} from "@/lib/task-tags";
import { collectSubtreeNodeIds } from "@/lib/tree-utils";
import {
  focusTargetAfterRemoving,
  navigateOutlineCard,
  shouldIgnoreCardKeyboard,
} from "@/lib/card-keyboard-nav";
import { useTaskTreeStore } from "@/store/task-tree-store";
import type { TaskNode } from "@/types/task-node";

import { ConfirmDialog } from "./confirm-dialog";
import { DepthLevelsControl } from "./depth-levels-control";

const focusActionBtnClass =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition";

function isInteractiveFocusTarget(target: EventTarget | null): boolean {
  if (!target) return false;
  const el =
    target instanceof Element ? target : target instanceof Text ? target.parentElement : null;
  return Boolean(
    el?.closest("button, input, textarea, select, a, [role='menu'], [role='menuitem']"),
  );
}

/** Breite einer Baum-Einrückungsstufe in der Fokus-Outline. */
const FOCUS_TREE_GUIDE_COL_REM = 1.375;

function FocusTreeGuides({
  ancestorContinues,
  isLastSibling,
}: {
  ancestorContinues: boolean[];
  isLastSibling: boolean;
}) {
  return (
    <div className="flex shrink-0 self-stretch" aria-hidden>
      {ancestorContinues.map((continues, i) => (
        <div
          key={`v-${i}`}
          className="relative shrink-0"
          style={{ width: `${FOCUS_TREE_GUIDE_COL_REM}rem` }}
        >
          {continues ? (
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-slate-200/90" />
          ) : null}
        </div>
      ))}
      <div
        className="relative shrink-0"
        style={{ width: `${FOCUS_TREE_GUIDE_COL_REM}rem` }}
      >
        <span
          className={[
            "absolute left-1/2 w-px -translate-x-1/2 bg-slate-200/90",
            isLastSibling ? "top-0 h-1/2" : "inset-y-0",
          ].join(" ")}
        />
        <span className="absolute left-1/2 top-1/2 h-px w-[calc(50%+0.5px)] bg-slate-200/90" />
      </div>
    </div>
  );
}

function FocusTagChips({
  tags,
  completedTag,
  show,
}: {
  tags: string[];
  completedTag: string;
  show: boolean;
}) {
  if (!show) return null;
  const visibleTags = tagsWithoutCompletedTag(tags, completedTag);
  if (visibleTags.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-0.5">
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
  );
}

function deleteConfirmMessage(node: TaskNode): string {
  const title = node.title.trim() || "Diese Karte";
  const n = collectSubtreeNodeIds(node).size;
  if (n <= 1) {
    return `„${title}“ endgültig löschen?`;
  }
  return `„${title}“ und alle Unteraufgaben (${n} Karten) endgültig löschen?`;
}

function focusGapId(listParentId: string | null, insertIndex: number): string {
  return `focus-gap|${listParentId ?? "root"}|${insertIndex}`;
}

function parseFocusGapId(id: string): { listParentId: string | null; insertIndex: number } | null {
  if (!id.startsWith("focus-gap|")) return null;
  const rest = id.slice("focus-gap|".length);
  const sep = rest.lastIndexOf("|");
  if (sep < 0) return null;
  const parentKey = rest.slice(0, sep);
  const insertIndex = Number(rest.slice(sep + 1));
  if (!Number.isFinite(insertIndex)) return null;
  return {
    listParentId: parentKey === "root" ? null : parentKey,
    insertIndex,
  };
}

const FOCUS_ROW_GAP_PX = 12;

function FocusDropGap({
  listParentId,
  insertIndex,
  active,
  placement,
}: {
  listParentId: string | null;
  insertIndex: number;
  active: boolean;
  placement: "before" | "after";
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: focusGapId(listParentId, insertIndex),
    data: { listParentId, insertIndex },
  });

  return (
    <div
      ref={setNodeRef}
      className={[
        "pointer-events-auto absolute left-0 right-0 z-10 rounded transition-colors",
        placement === "before" ? "-top-1.5" : "-bottom-1.5",
        active && isOver ? "bg-sky-100/90" : "",
      ].join(" ")}
      style={{ height: FOCUS_ROW_GAP_PX }}
    >
      {active && isOver ? (
        <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-sky-600 shadow-sm ring-2 ring-sky-200/80" />
      ) : null}
    </div>
  );
}

interface FocusRowProps {
  row: FocusOutlineRow;
  treeGuides: boolean[];
  completedTag: string;
  fieldVisibility: CardFieldVisibility;
  isEditing: boolean;
  isDragging: boolean;
  dropActive: boolean;
  isNestDropTarget: boolean;
  isBranchCollapsed: boolean;
  isKeyboardFocus?: boolean;
  onKeyboardFocus?: () => void;
  onToggleCollapsed: () => void;
  onToggleDone: () => void;
  onStartEdit: () => void;
  onSaveTitle: (title: string, addSiblingAfter?: boolean) => void;
  onCancelEdit: () => void;
  onOpenDetails: () => void;
  onFocusHere: () => void;
  onAddChild: () => void;
  onRequestDelete: () => void;
}

function FocusRow({
  row,
  treeGuides,
  completedTag,
  fieldVisibility,
  isEditing,
  isDragging,
  dropActive,
  isNestDropTarget,
  isBranchCollapsed,
  isKeyboardFocus = false,
  onKeyboardFocus,
  onToggleCollapsed,
  onToggleDone,
  onStartEdit,
  onSaveTitle,
  onCancelEdit,
  onOpenDetails,
  onFocusHere,
  onAddChild,
  onRequestDelete,
}: FocusRowProps) {
  const { node } = row;
  const done = isTaskMarkedDone(node, completedTag);
  const hasChildren = node.children.length > 0;
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(node.title);

  const { attributes, listeners, setNodeRef: setDragRef, transform } = useDraggable({
    id: node.id,
    data: { listParentId: row.listParentId, kind: "focusRow" as const },
  });

  const { setNodeRef: setDropRef, isOver: isNestOver } = useDroppable({
    id: node.id,
    disabled: isDragging,
    data: { kind: "focusNest" as const, nodeId: node.id },
  });

  const setNodeRef = useCallback(
    (el: HTMLDivElement | null) => {
      setDragRef(el);
      setDropRef(el);
    },
    [setDragRef, setDropRef],
  );

  useEffect(() => {
    if (isEditing) {
      setDraft(node.title);
      const focus = () => inputRef.current?.focus({ preventScroll: true });
      requestAnimationFrame(focus);
    }
  }, [isEditing, node.id, node.title]);

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const dueHint =
    fieldVisibility.dueDate && node.dueDate ? formatDueHint(node.dueDate) : null;
  const overdue =
    fieldVisibility.dueDate &&
    node.dueDate &&
    isDueOverdue(node.dueDate, isTaskMarkedDone(node, completedTag));

  return (
    <div className="relative flex min-w-0">
      {row.depth > 1 ? (
        <FocusTreeGuides ancestorContinues={treeGuides} isLastSibling={row.isLastSibling} />
      ) : null}
      <div className="relative min-w-0 flex-1">
      <FocusDropGap
        listParentId={row.listParentId}
        insertIndex={row.siblingIndex}
        active={dropActive}
        placement="before"
      />
      <div
        ref={setNodeRef}
        data-focus-row-id={node.id}
        tabIndex={isKeyboardFocus ? -1 : undefined}
        style={style}
        onPointerDown={(e) => {
          if (isInteractiveFocusTarget(e.target)) return;
          onKeyboardFocus?.();
        }}
        className={[
          "group relative flex min-w-0 items-start gap-1 rounded-lg border px-1 py-1 transition",
          isDragging ? "z-20 border-dashed border-sky-300 bg-sky-50/50 opacity-40 shadow-none" : "",
          isKeyboardFocus ? "border-sky-400 bg-sky-50/80 ring-2 ring-sky-300/90" : "",
          isNestDropTarget || isNestOver
            ? "border-violet-400 bg-violet-50/90 ring-2 ring-violet-300/80"
            : done
              ? "border-transparent bg-slate-50/80"
              : overdue
                ? "border-red-200/80 bg-red-50/40"
                : "border-transparent bg-white hover:border-slate-200/80 hover:bg-slate-50/50",
        ].join(" ")}
      >
      {hasChildren ? (
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-white hover:text-slate-700"
          title={isBranchCollapsed ? "Unterpunkte anzeigen" : "Unterpunkte verstecken"}
          aria-label={isBranchCollapsed ? "Unterpunkte anzeigen" : "Unterpunkte verstecken"}
          aria-expanded={!isBranchCollapsed}
        >
          {isBranchCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          )}
        </button>
      ) : (
        <span className="mt-0.5 h-7 w-7 shrink-0" aria-hidden />
      )}
      <button
        type="button"
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-white hover:text-emerald-700"
        onClick={onToggleDone}
        title={done ? "Als offen markieren" : "Als erledigt markieren"}
        aria-label={done ? "Als offen markieren" : "Als erledigt markieren"}
        aria-pressed={done}
      >
        {done ? (
          <CircleCheck className="h-4 w-4 text-emerald-600" strokeWidth={2.25} />
        ) : (
          <Circle className="h-4 w-4" strokeWidth={2} />
        )}
      </button>

      <div className="min-w-0 flex-1 py-0.5">
        {isEditing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSaveTitle(draft, true);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onCancelEdit();
              }
            }}
            onBlur={() => onSaveTitle(draft)}
            className="w-full rounded-md border border-sky-300 bg-white px-2 py-1 text-sm font-medium text-slate-900 outline-none ring-2 ring-sky-400/40"
            placeholder="Titel …"
          />
        ) : (
          <button
            type="button"
            onClick={onStartEdit}
            onDoubleClick={(e) => {
              e.preventDefault();
              onOpenDetails();
            }}
            className={[
              "block w-full text-left text-sm leading-snug",
              done ? "text-slate-400 line-through" : "font-medium text-slate-800",
            ].join(" ")}
            title="Klick: Titel bearbeiten · Doppelklick: Details"
          >
            {node.title.trim() || <span className="font-normal text-slate-400">(Ohne Titel)</span>}
          </button>
        )}
        {dueHint && !isEditing ? (
          <p
            className={[
              "mt-0.5 text-[11px]",
              overdue ? "font-medium text-red-700" : "text-slate-500",
            ].join(" ")}
          >
            {overdue ? "überfällig " : ""}
            {dueHint}
          </p>
        ) : null}
        <FocusTagChips
          tags={node.tags}
          completedTag={completedTag}
          show={fieldVisibility.tags && !isEditing}
        />
      </div>

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition max-sm:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100">
        {node.children.length > 0 ? (
          <button
            type="button"
            onClick={onFocusHere}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-violet-50 hover:text-violet-700"
            title="Fokus auf diesen Zweig"
            aria-label="Fokus auf diesen Zweig"
          >
            <Target className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onAddChild}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-sky-50 hover:text-sky-700"
          title="Unterpunkt anlegen"
          aria-label="Unterpunkt anlegen"
        >
          <ListPlus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onOpenDetails}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-sky-700"
          title="Details"
          aria-label="Details bearbeiten"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onRequestDelete}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-700"
          title="Löschen"
          aria-label="Löschen"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="flex h-7 cursor-grab touch-none items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-slate-600 active:cursor-grabbing"
          aria-label="Sortieren"
          title="Ziehen: sortieren oder als Unterpunkt ablegen"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>
      </div>
      {row.isLastSibling ? (
        <FocusDropGap
          listParentId={row.listParentId}
          insertIndex={row.siblingIndex + 1}
          active={dropActive}
          placement="after"
        />
      ) : null}
      </div>
    </div>
  );
}

export interface FocusModeViewProps {
  focusNodeId: string;
  hideCompletedTasks: boolean;
  fieldVisibility: CardFieldVisibility;
  onClose: () => void;
  onFocusNodeChange: (nodeId: string) => void;
  onOpenDetails: (nodeId: string) => void;
}

export function FocusModeView({
  focusNodeId,
  hideCompletedTasks,
  fieldVisibility,
  onClose,
  onFocusNodeChange,
  onOpenDetails,
}: FocusModeViewProps) {
  const roots = useTaskTreeStore((s) => s.roots);
  const completedTag = useTaskTreeStore((s) => s.completedTag);
  const updateCard = useTaskTreeStore((s) => s.updateCard);
  const addCardAfter = useTaskTreeStore((s) => s.addCardAfter);
  const addCardAfterSibling = useTaskTreeStore((s) => s.addCardAfterSibling);
  const removeCard = useTaskTreeStore((s) => s.removeCard);
  const applyTreeDrag = useTaskTreeStore((s) => s.applyTreeDrag);
  const collapsedIds = useTaskTreeStore((s) => s.collapsedIds);
  const toggleNodeCollapsed = useTaskTreeStore((s) => s.toggleNodeCollapsed);
  const applyFocusDepthInView = useTaskTreeStore((s) => s.applyFocusDepthInView);

  const [titleEditId, setTitleEditId] = useState<string | null>(null);
  const [focusRootEditing, setFocusRootEditing] = useState(false);
  const [focusRootDraft, setFocusRootDraft] = useState("");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [nestDropTargetId, setNestDropTargetId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [keyboardFocusId, setKeyboardFocusId] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const focusRootInputRef = useRef<HTMLInputElement>(null);

  const focusNode = findNodeById(roots, focusNodeId);
  const ancestorPath = useMemo(() => {
    const path = pathFromRootToNode(roots, focusNodeId);
    if (!path || path.length <= 1) return [];
    return path.slice(0, -1).map((id) => findNodeById(roots, id)).filter(Boolean) as TaskNode[];
  }, [roots, focusNodeId]);

  const collapsedSet = useMemo(() => new Set(collapsedIds), [collapsedIds]);

  const outlineMaxDepth = useMemo(
    () => getFocusOutlineMaxDepth(roots, focusNodeId, hideCompletedTasks, completedTag),
    [roots, focusNodeId, hideCompletedTasks, completedTag],
  );

  const rows = useMemo(
    () =>
      buildFocusOutlineRows(roots, focusNodeId, hideCompletedTasks, completedTag, {
        collapsedIds: collapsedSet,
      }),
    [roots, focusNodeId, hideCompletedTasks, completedTag, collapsedSet],
  );

  const rowsById = useMemo(() => new Map(rows.map((row) => [row.node.id, row])), [rows]);

  const focusRootCollapsed = collapsedSet.has(focusNodeId);
  const focusRootHasChildren = Boolean(focusNode?.children.length);

  useEffect(() => {
    setKeyboardFocusId(focusNodeId);
  }, [focusNodeId]);

  const scrollFocusRowIntoView = useCallback((nodeId: string) => {
    const el = document.querySelector(`[data-focus-row-id="${nodeId}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      el.focus({ preventScroll: true });
    }
  }, []);

  const stats = focusNode ? countFocusSubtree(focusNode, completedTag) : { total: 0, done: 0, open: 0 };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 10 } }),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !titleEditId && !focusRootEditing && !pendingDeleteId) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, titleEditId, focusRootEditing, pendingDeleteId]);

  useEffect(() => {
    if (titleEditId || focusRootEditing || pendingDeleteId || activeDragId || exportMenuOpen) {
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreCardKeyboard(e)) return;

      const arrowKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const;
      const isArrow = arrowKeys.includes(e.key as (typeof arrowKeys)[number]);
      let currentId = keyboardFocusId ?? focusNodeId;

      if (isArrow) {
        e.preventDefault();
        const direction =
          e.key === "ArrowUp"
            ? "up"
            : e.key === "ArrowDown"
              ? "down"
              : e.key === "ArrowLeft"
                ? "left"
                : "right";
        const { nextId, shouldExpand } = navigateOutlineCard(
          roots,
          collapsedSet,
          focusNodeId,
          rows,
          focusRootCollapsed,
          currentId,
          direction,
        );
        if (!nextId) return;
        if (shouldExpand) toggleNodeCollapsed(currentId);
        if (currentId === focusNodeId && direction === "left" && nextId !== focusNodeId) {
          onFocusNodeChange(nextId);
          return;
        }
        setKeyboardFocusId(nextId);
        scrollFocusRowIntoView(nextId);
        return;
      }

      if (e.key === " " || e.key === "Spacebar") {
        const node = findNodeById(roots, currentId);
        if (!node?.children.length) return;
        e.preventDefault();
        toggleNodeCollapsed(currentId);
        return;
      }

      if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const newId = addCardAfterSibling(currentId);
        if (!newId) return;
        setKeyboardFocusId(newId);
        setTitleEditId(newId);
        scrollFocusRowIntoView(newId);
        return;
      }

      if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const newId = addCardAfter(currentId);
        if (!newId) return;
        toggleNodeCollapsed(currentId);
        setKeyboardFocusId(newId);
        setTitleEditId(newId);
        scrollFocusRowIntoView(newId);
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        setPendingDeleteId(currentId);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    titleEditId,
    focusRootEditing,
    pendingDeleteId,
    activeDragId,
    exportMenuOpen,
    keyboardFocusId,
    focusNodeId,
    roots,
    collapsedSet,
    rows,
    focusRootCollapsed,
    toggleNodeCollapsed,
    addCardAfterSibling,
    addCardAfter,
    scrollFocusRowIntoView,
    onFocusNodeChange,
  ]);

  useEffect(() => {
    if (focusRootEditing && focusNode) {
      setFocusRootDraft(focusNode.title);
      requestAnimationFrame(() => focusRootInputRef.current?.focus({ preventScroll: true }));
    }
  }, [focusRootEditing, focusNode]);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (exportMenuRef.current?.contains(e.target as Node)) return;
      setExportMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [exportMenuOpen]);

  const focusExportOptions = useMemo(
    () => ({
      hideCompletedTasks,
      completedTag,
      fieldVisibility,
      breadcrumbTitles: ancestorPath.map((a) => a.title),
    }),
    [ancestorPath, completedTag, fieldVisibility, hideCompletedTasks],
  );

  const handlePrintFocus = useCallback(() => {
    const ok = printFocusOutline(roots, focusNodeId, focusExportOptions);
    if (!ok) {
      window.alert(
        "Drucken nicht möglich — Pop-up blockiert oder Fokus-Karte nicht gefunden. Pop-ups für diese Seite erlauben.",
      );
    }
  }, [focusExportOptions, focusNodeId, roots]);

  const handleExportMarkdown = useCallback(() => {
    setExportMenuOpen(false);
    if (!downloadFocusOutlineMarkdown(roots, focusNodeId, focusExportOptions)) {
      window.alert("Export fehlgeschlagen.");
    }
  }, [focusExportOptions, focusNodeId, roots]);

  const handleExportPlainText = useCallback(() => {
    setExportMenuOpen(false);
    if (!downloadFocusOutlinePlainText(roots, focusNodeId, focusExportOptions)) {
      window.alert("Export fehlgeschlagen.");
    }
  }, [focusExportOptions, focusNodeId, roots]);

  const toggleDone = useCallback(
    (nodeId: string, node: TaskNode) => {
      const done = isTaskMarkedDone(node, completedTag);
      updateCard(nodeId, { tags: setCompletedTagOnTags(node.tags, completedTag, !done) });
    },
    [completedTag, updateCard],
  );

  const handleTitleSave = useCallback(
    (nodeId: string, title: string, addSiblingAfter?: boolean) => {
      const trimmed = title.trim();
      updateCard(nodeId, { title: trimmed });
      if (addSiblingAfter) {
        const newId = addCardAfterSibling(nodeId);
        if (newId) {
          setTitleEditId(newId);
          return;
        }
      }
      setTitleEditId(null);
    },
    [addCardAfterSibling, updateCard],
  );

  const handleTitleCancel = useCallback(
    (nodeId: string) => {
      const node = findNodeById(roots, nodeId);
      if (node && !node.title.trim()) {
        removeCard(nodeId);
      }
      setTitleEditId(null);
    },
    [removeCard, roots],
  );

  const handleFocusRootSave = useCallback(() => {
    if (!focusNode) return;
    updateCard(focusNodeId, { title: focusRootDraft.trim() });
    setFocusRootEditing(false);
  }, [focusNode, focusNodeId, focusRootDraft, updateCard]);

  const handleAddChild = useCallback(
    (parentId: string) => {
      const id = addCardAfter(parentId);
      setTitleEditId(id);
    },
    [addCardAfter],
  );

  const confirmDelete = useCallback(() => {
    const id = pendingDeleteId;
    if (!id) return;
    const nextFocus = focusTargetAfterRemoving(roots, id);
    setPendingDeleteId(null);
    removeCard(id);
    if (id === focusNodeId) {
      onClose();
      return;
    }
    if (titleEditId === id) setTitleEditId(null);
    if (focusRootEditing) setFocusRootEditing(false);
    if (nextFocus) {
      setKeyboardFocusId(nextFocus);
      requestAnimationFrame(() => scrollFocusRowIntoView(nextFocus));
    }
  }, [
    pendingDeleteId,
    removeCard,
    focusNodeId,
    onClose,
    titleEditId,
    focusRootEditing,
    roots,
    scrollFocusRowIntoView,
  ]);

  const pendingDeleteNode = pendingDeleteId ? findNodeById(roots, pendingDeleteId) : null;

  const onDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
    setNestDropTargetId(null);
  };

  const onDragOver = (event: DragOverEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId || parseFocusGapId(overId)) {
      setNestDropTargetId(null);
      return;
    }
    setNestDropTargetId(
      canNestUnderInFocus(roots, activeId, overId, focusNodeId) ? overId : null,
    );
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    setNestDropTargetId(null);
    const activeId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;

    const gap = parseFocusGapId(overId);
    if (gap) {
      if (!canInsertAtFocusGap(roots, activeId, gap.listParentId, focusNodeId)) return;
      const columnIndex = columnIndexForSiblingList(roots, gap.listParentId);
      applyTreeDrag(activeId, {
        kind: "columnGap",
        columnIndex,
        insertIndex: gap.insertIndex,
        listParentId: gap.listParentId,
      });
      return;
    }

    if (!canNestUnderInFocus(roots, activeId, overId, focusNodeId)) return;
    const targetParent = findDirectParentId(roots, overId);
    applyTreeDrag(activeId, {
      kind: "card",
      columnIndex: columnIndexForSiblingList(roots, targetParent ?? null),
      cardId: overId,
      listParentId: targetParent ?? null,
    });
  };

  const activeDragNode = activeDragId ? findNodeById(roots, activeDragId) : null;

  const {
    setNodeRef: setFocusRootDropRef,
    isOver: isFocusRootNestOver,
  } = useDroppable({
    id: focusNodeId,
    disabled: !activeDragId || activeDragId === focusNodeId,
    data: { kind: "focusNest" as const, nodeId: focusNodeId },
  });

  if (!focusNode) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
        Karte nicht gefunden.
        <button type="button" onClick={onClose} className="ml-2 text-sky-700 underline">
          Zurück
        </button>
      </div>
    );
  }

  const focusRootDone = isTaskMarkedDone(focusNode, completedTag);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-100/60">
      <div className="shrink-0 border-b border-slate-200/80 bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-violet-200/90 bg-violet-50/80 px-2.5 text-xs font-medium text-violet-800 hover:bg-violet-100"
            title="Fokus-Modus beenden (Esc)"
            aria-label="Fokus-Modus beenden"
          >
            <X className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Fokus beenden
          </button>

          {ancestorPath.length > 0 ? (
            <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5 text-xs text-slate-500">
              {ancestorPath.map((a) => (
                <span key={a.id} className="flex min-w-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => onFocusNodeChange(a.id)}
                    className="max-w-[8rem] truncate rounded px-1 py-0.5 hover:bg-slate-100 hover:text-slate-800"
                    title={`Fokus: ${a.title.trim() || a.id}`}
                  >
                    {a.title.trim() || "(Ohne Titel)"}
                  </button>
                  <ChevronRight className="h-3 w-3 shrink-0 text-slate-300" aria-hidden />
                </span>
              ))}
            </nav>
          ) : (
            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-violet-700">
              <Target className="h-3.5 w-3.5" aria-hidden />
              Fokus
            </span>
          )}

          {outlineMaxDepth > 0 ? (
            <DepthLevelsControl
              maxLevel={outlineMaxDepth}
              onApplyLevel={(depth) => applyFocusDepthInView(focusNodeId, depth)}
              onExpandAll={() => applyFocusDepthInView(focusNodeId, null)}
            />
          ) : null}

          <span
            className={[
              "rounded-full px-2.5 py-1 text-[11px] font-medium tabular-nums",
              stats.open === 0
                ? "bg-emerald-100 text-emerald-800"
                : "bg-slate-100 text-slate-600",
            ].join(" ")}
            title="Erledigt / gesamt im Fokus-Zweig"
          >
            {stats.done}/{stats.total} erledigt
          </span>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePrintFocus}
              className="flex h-8 items-center gap-1 rounded-lg border border-slate-200/90 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              title="Fokus-Outline drucken"
            >
              <Printer className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Drucken</span>
            </button>
            <div ref={exportMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setExportMenuOpen((o) => !o)}
                className="flex h-8 items-center gap-1 rounded-lg border border-slate-200/90 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                title="Fokus-Outline exportieren"
                aria-expanded={exportMenuOpen}
                aria-haspopup="menu"
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">Export</span>
              </button>
              {exportMenuOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-20 mt-1 min-w-[10rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleExportMarkdown}
                    className="block w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                  >
                    Markdown (.md)
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleExportPlainText}
                    className="block w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                  >
                    Text (.txt)
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-4 py-4">
        <div className="mx-auto max-w-3xl space-y-3">
          <section
            ref={setFocusRootDropRef}
            data-focus-row-id={focusNodeId}
            tabIndex={keyboardFocusId === focusNodeId ? -1 : undefined}
            onPointerDown={(e) => {
              if (isInteractiveFocusTarget(e.target)) return;
              setKeyboardFocusId(focusNodeId);
            }}
            className={[
              "rounded-xl border bg-white p-3 shadow-sm ring-1 transition",
              keyboardFocusId === focusNodeId
                ? "border-sky-400 ring-2 ring-sky-300/90"
                : nestDropTargetId === focusNodeId || isFocusRootNestOver
                  ? "border-violet-400 ring-violet-300/80"
                  : "border-violet-200/70 ring-violet-100/80",
            ].join(" ")}
          >
            <div className="flex items-start gap-2">
              {focusRootHasChildren ? (
                <button
                  type="button"
                  onClick={() => toggleNodeCollapsed(focusNodeId)}
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-violet-50 hover:text-slate-700"
                  title={focusRootCollapsed ? "Unterpunkte anzeigen" : "Unterpunkte verstecken"}
                  aria-label={focusRootCollapsed ? "Unterpunkte anzeigen" : "Unterpunkte verstecken"}
                  aria-expanded={!focusRootCollapsed}
                >
                  {focusRootCollapsed ? (
                    <ChevronRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  ) : (
                    <ChevronDown className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  )}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => toggleDone(focusNodeId, focusNode)}
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-violet-50 hover:text-emerald-700"
                aria-pressed={focusRootDone}
                title={focusRootDone ? "Als offen markieren" : "Als erledigt markieren"}
              >
                {focusRootDone ? (
                  <CircleCheck className="h-5 w-5 text-emerald-600" strokeWidth={2.25} />
                ) : (
                  <Circle className="h-5 w-5" strokeWidth={2} />
                )}
              </button>
              <div className="min-w-0 flex-1">
                {focusRootEditing ? (
                  <input
                    ref={focusRootInputRef}
                    value={focusRootDraft}
                    onChange={(e) => setFocusRootDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleFocusRootSave();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setFocusRootEditing(false);
                      }
                    }}
                    onBlur={handleFocusRootSave}
                    className="w-full rounded-lg border border-violet-300 bg-white px-2.5 py-1.5 text-base font-semibold text-slate-900 outline-none ring-2 ring-violet-400/30"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setFocusRootEditing(true)}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      onOpenDetails(focusNodeId);
                    }}
                    className={[
                      "block w-full text-left text-base font-semibold leading-snug",
                      focusRootDone ? "text-slate-400 line-through" : "text-slate-900",
                    ].join(" ")}
                  >
                    {focusNode.title.trim() || (
                      <span className="font-normal text-slate-400">(Ohne Titel)</span>
                    )}
                  </button>
                )}
                <FocusTagChips
                  tags={focusNode.tags}
                  completedTag={completedTag}
                  show={fieldVisibility.tags && !focusRootEditing}
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  {focusNode.children.length === 0
                    ? "Noch keine Unterpunkte — unten anlegen."
                    : focusRootCollapsed
                      ? `${focusNode.children.length} Unterpunkt${focusNode.children.length === 1 ? "" : "e"} ausgeblendet`
                      : rows.length === 0
                        ? "Keine Unterpunkte sichtbar (Filter oder eingeklappt)"
                        : `${rows.length} Unterpunkt${rows.length === 1 ? "" : "e"} sichtbar`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => onOpenDetails(focusNodeId)}
                  className={`${focusActionBtnClass} hover:bg-slate-50 hover:text-sky-700`}
                  title="Details der Fokus-Karte"
                  aria-label="Details der Fokus-Karte"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDeleteId(focusNodeId)}
                  className={`${focusActionBtnClass} hover:bg-red-50 hover:text-red-700`}
                  title="Fokus-Karte löschen"
                  aria-label="Fokus-Karte löschen"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            onDragCancel={() => {
              setActiveDragId(null);
              setNestDropTargetId(null);
            }}
          >
            <section
              className="flex flex-col gap-1 rounded-xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm"
              aria-label="Unterpunkte"
            >
              {rows.length === 0 ? (
                <div className="relative px-1 py-2">
                  {!focusRootCollapsed ? (
                    <FocusDropGap
                      listParentId={focusNodeId}
                      insertIndex={0}
                      active={Boolean(activeDragId)}
                      placement="before"
                    />
                  ) : null}
                  <p className="px-2 py-4 text-center text-sm text-slate-400">
                    {focusRootCollapsed
                      ? "Unterpunkte ausgeblendet — oben aufklappen."
                      : focusNode.children.length === 0
                        ? "Keine Unterpunkte — ideal zum schnellen Erfassen."
                        : "Keine Unterpunkte sichtbar — Filter prüfen oder oben aufklappen."}
                  </p>
                </div>
              ) : (
                rows.map((row) => (
                  <FocusRow
                    key={row.node.id}
                    row={row}
                    treeGuides={computeFocusRowTreeGuides(row, rowsById)}
                    completedTag={completedTag}
                    fieldVisibility={fieldVisibility}
                    isEditing={titleEditId === row.node.id}
                    isDragging={activeDragId === row.node.id}
                    dropActive={Boolean(activeDragId)}
                    isNestDropTarget={nestDropTargetId === row.node.id}
                    isBranchCollapsed={collapsedSet.has(row.node.id)}
                    isKeyboardFocus={keyboardFocusId === row.node.id}
                    onKeyboardFocus={() => setKeyboardFocusId(row.node.id)}
                    onToggleCollapsed={() => toggleNodeCollapsed(row.node.id)}
                    onToggleDone={() => toggleDone(row.node.id, row.node)}
                    onStartEdit={() => setTitleEditId(row.node.id)}
                    onSaveTitle={(title, addSiblingAfter) =>
                      handleTitleSave(row.node.id, title, addSiblingAfter)
                    }
                    onCancelEdit={() => handleTitleCancel(row.node.id)}
                    onOpenDetails={() => onOpenDetails(row.node.id)}
                    onFocusHere={() => onFocusNodeChange(row.node.id)}
                    onAddChild={() => handleAddChild(row.node.id)}
                    onRequestDelete={() => setPendingDeleteId(row.node.id)}
                  />
                ))
              )}
            </section>

            <DragOverlay dropAnimation={null}>
              {activeDragNode ? (
                <div className="rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-lg">
                  {activeDragNode.title.trim() || "(Ohne Titel)"}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>

          <button
            type="button"
            onClick={() => handleAddChild(focusNodeId)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-sky-300/90 bg-sky-50/50 py-3 text-sm font-medium text-sky-800 transition hover:border-sky-400 hover:bg-sky-50"
          >
            <Plus className="h-4 w-4" />
            Neuer Punkt
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Karte löschen?"
        message={pendingDeleteNode ? deleteConfirmMessage(pendingDeleteNode) : ""}
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
