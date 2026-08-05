"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  ChevronRight,
  Download,
  FileStack,
  ListPlus,
  MoreHorizontal,
  Pencil,
  StickyNote,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";

import type { CardInteractionMode } from "@/lib/card-expand";
import { isCoarsePointerDevice } from "@/lib/coarse-pointer";
import { nodeDisplayTitle } from "@/lib/tree-node-kind";
import type { TaskNode } from "@/types/task-node";

import { NoteMarkdownContent } from "./note-markdown-content";

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

export interface NoteRowProps {
  node: TaskNode;
  isSearchFocus?: boolean;
  isKeyboardFocus?: boolean;
  isNestDropTarget?: boolean;
  nestDepth?: number;
  isCollapsed?: boolean;
  interactionMode?: CardInteractionMode;
  onSelect: () => void;
  onDrillIn: () => void;
  onToggleExpand?: () => void;
  onAddChild: () => void;
  onOpenDetails: () => void;
  onRequestExport?: () => void;
  onRequestInsertTemplate?: () => void;
  onRequestDelete?: () => void;
}

export function NoteRow({
  node,
  isSearchFocus = false,
  isKeyboardFocus = false,
  isNestDropTarget = false,
  nestDepth = 0,
  isCollapsed = true,
  interactionMode = "navigate",
  onSelect,
  onDrillIn,
  onToggleExpand,
  onAddChild,
  onOpenDetails,
  onRequestExport,
  onRequestInsertTemplate,
  onRequestDelete,
}: NoteRowProps) {
  const headingId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const [coarsePointer, setCoarsePointer] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: node.id,
    data: { kind: "contextCard" as const, nodeId: node.id },
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
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target;
      if (menuRef.current?.contains(t instanceof Node ? t : null)) return;
      if (menuPanelRef.current?.contains(t instanceof Node ? t : null)) return;
      setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  const hasChildren = node.children.length > 0;
  const expandMode = interactionMode === "expand";
  const activateChildren = () => {
    if (expandMode) onToggleExpand?.();
    else onDrillIn();
  };
  const displayTitle = nodeDisplayTitle(node);
  const hasExplicitTitle = Boolean(node.title.trim());
  const hasMarkdown = Boolean((node.markdown ?? "").trim());

  const style = {
    ...(transform
      ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
      : {}),
    ...(nestDepth > 0 ? { marginLeft: `${nestDepth * 0.75}rem` } : {}),
  };

  const openMenu = (top: number, left: number) => {
    setMenuAnchor({ top, left });
    setMenuOpen(true);
  };

  const handleContextMenu = (e: MouseEvent) => {
    if (coarsePointer || isDragging) return;
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

  const menu =
    menuOpen && menuAnchor ? (
      <div
        ref={menuPanelRef}
        role="menu"
        style={{ top: menuAnchor.top, left: menuAnchor.left }}
        className={rowMenuPanelClass}
      >
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
          Bearbeiten
        </button>
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
        if (isInteractiveTarget(e.target)) return;
        onSelect();
      }}
      onDoubleClick={(e) => {
        if (isInteractiveTarget(e.target)) return;
        e.preventDefault();
        if (hasChildren) activateChildren();
        else onOpenDetails();
      }}
      onContextMenu={handleContextMenu}
      className={[
        "group relative flex touch-none cursor-grab items-stretch gap-1 rounded-lg border border-violet-200/80 bg-violet-50/40 px-2 py-2 shadow-sm transition active:cursor-grabbing",
        nestDepth > 0 ? "bg-violet-50/30" : "",
        isDragging ? "opacity-40" : "",
        isNestDropTarget || isOver
          ? "border-violet-400 bg-violet-50/90 ring-2 ring-violet-300/70"
          : "",
        isSearchFocus ? "ring-2 ring-amber-300/90" : "",
        isKeyboardFocus && !isSearchFocus ? "ring-2 ring-violet-300/90" : "",
      ].join(" ")}
    >
      <span
        className="absolute inset-y-0 left-0 w-1 rounded-l-lg bg-violet-400/80"
        aria-hidden
      />

      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-violet-600">
        <StickyNote className="h-4 w-4" aria-hidden />
      </div>

      <div className="min-w-0 flex-1">
        {hasExplicitTitle ? (
          <button
            type="button"
            id={headingId}
            className="mb-0.5 w-full truncate text-left text-sm font-medium text-slate-900 hover:text-violet-900"
            title={displayTitle}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetails();
            }}
          >
            {displayTitle}
          </button>
        ) : (
          <span id={headingId} className="sr-only">
            {displayTitle}
          </span>
        )}
        {hasMarkdown ? (
          <NoteMarkdownContent markdown={node.markdown} compact />
        ) : (
          <p className="mt-0.5 text-[11px] italic text-slate-400">Leere Notiz — zum Bearbeiten öffnen</p>
        )}
      </div>

      <div
        className="flex shrink-0 items-start gap-0.5"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-violet-200/90 bg-white text-violet-700 hover:bg-violet-50"
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
            title={expandMode ? (isCollapsed ? "Aufklappen" : "Zuklappen") : "Hinein"}
            aria-label={
              expandMode
                ? isCollapsed
                  ? "Aufklappen"
                  : "Zuklappen"
                : "Hinein navigieren"
            }
            onClick={(e) => {
              e.stopPropagation();
              activateChildren();
            }}
          >
            <ChevronRight
              className={[
                "h-3.5 w-3.5 transition",
                expandMode && !isCollapsed ? "rotate-90" : "",
              ].join(" ")}
              aria-hidden
            />
          </button>
        ) : null}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
            title="Aktionen"
            aria-label="Aktionen"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              openMenu(rect.bottom + 4, rect.right - 176);
            }}
          >
            <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
          </button>
          {menu ? createPortal(menu, document.body) : null}
        </div>
      </div>
    </article>
  );
}
