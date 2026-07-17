"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ChevronDown, ChevronRight, GripVertical, Trash2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { CLIPBOARD_SIDEBAR_DROP_ID, clipboardGapId } from "@/lib/clipboard-dnd";
import type { TaskNode } from "@/types/task-node";

function ClipboardGap({
  listParentId,
  insertIndex,
  showLine,
}: {
  listParentId: string | null;
  insertIndex: number;
  showLine: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: clipboardGapId(listParentId, insertIndex),
    data: {
      kind: "clipboardGap" as const,
      listParentId,
      insertIndex,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={[
        "relative my-0.5 min-h-[6px] rounded transition-colors",
        isOver ? "bg-sky-100/90" : "",
      ].join(" ")}
    >
      {showLine ? (
        <div className="pointer-events-none absolute inset-x-2 top-1/2 h-1 -translate-y-1/2 rounded-full bg-sky-600 ring-2 ring-sky-200/90" />
      ) : null}
    </div>
  );
}

function ClipboardCardRow({
  node,
  listParentId,
  depth,
  collapsed,
  onToggleCollapsed,
  activeDragId,
}: {
  node: TaskNode;
  listParentId: string | null;
  depth: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  activeDragId: string | null;
}) {
  const hasChildren = node.children.length > 0;
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: node.id,
    data: {
      kind: "clipboardCard" as const,
      listParentId,
      source: "clipboard" as const,
    },
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: node.id,
    data: {
      kind: "clipboardCard" as const,
      listParentId,
      source: "clipboard" as const,
    },
  });

  const setRef = (el: HTMLElement | null) => {
    setDragRef(el);
    setDropRef(el);
  };

  const hidden = isDragging;

  return (
    <div style={{ paddingLeft: `${depth * 14}px` }}>
      <div
        ref={setRef}
        className={[
          "flex items-start gap-1 rounded-lg border px-2 py-1.5 transition",
          hidden ? "opacity-30" : "",
          isOver && activeDragId && activeDragId !== node.id
            ? "border-violet-300 bg-violet-50/80 ring-1 ring-violet-200"
            : "border-slate-200/90 bg-white",
        ].join(" ")}
      >
        <button
          type="button"
          className="flex h-6 w-5 shrink-0 touch-none items-center justify-center rounded text-slate-400 hover:bg-slate-50 hover:text-slate-700 active:cursor-grabbing"
          aria-label="Karte verschieben"
          {...listeners}
          {...attributes}
        >
          <GripVertical className="h-3.5 w-3.5" aria-hidden />
        </button>
        {hasChildren ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-50"
            aria-label={collapsed ? "Unterkarten einblenden" : "Unterkarten ausblenden"}
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        ) : (
          <span className="w-5 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-slate-900">
            {node.title.trim() || "(Ohne Titel)"}
          </p>
          {hasChildren ? (
            <p className="text-[10px] text-slate-500">
              {node.children.length} Unterkarte{node.children.length === 1 ? "" : "n"}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ClipboardTree({
  nodes,
  listParentId,
  depth,
  collapsedIds,
  onToggleCollapsed,
  activeDragId,
  activeOverGap,
}: {
  nodes: TaskNode[];
  listParentId: string | null;
  depth: number;
  collapsedIds: Set<string>;
  onToggleCollapsed: (nodeId: string) => void;
  activeDragId: string | null;
  activeOverGap: { listParentId: string | null; insertIndex: number } | null;
}) {
  return (
    <div className="space-y-0.5">
      {nodes.map((node, index) => {
        const collapsed = collapsedIds.has(node.id);
        const showGapLine =
          activeOverGap?.listParentId === listParentId && activeOverGap.insertIndex === index;
        return (
          <div key={node.id}>
            <ClipboardGap listParentId={listParentId} insertIndex={index} showLine={showGapLine} />
            <ClipboardCardRow
              node={node}
              listParentId={listParentId}
              depth={depth}
              collapsed={collapsed}
              onToggleCollapsed={() => onToggleCollapsed(node.id)}
              activeDragId={activeDragId}
            />
            {!collapsed && node.children.length > 0 ? (
              <ClipboardTree
                nodes={node.children}
                listParentId={node.id}
                depth={depth + 1}
                collapsedIds={collapsedIds}
                onToggleCollapsed={onToggleCollapsed}
                activeDragId={activeDragId}
                activeOverGap={activeOverGap}
              />
            ) : null}
          </div>
        );
      })}
      <ClipboardGap
        listParentId={listParentId}
        insertIndex={nodes.length}
        showLine={
          activeOverGap?.listParentId === listParentId &&
          activeOverGap.insertIndex === nodes.length
        }
      />
    </div>
  );
}

export interface ClipboardSidebarProps {
  open: boolean;
  roots: TaskNode[];
  activeDragId: string | null;
  activeOverGap: { listParentId: string | null; insertIndex: number } | null;
  onRequestClear: () => void;
  onClose: () => void;
}

export function ClipboardSidebar({
  open,
  roots,
  activeDragId,
  activeOverGap,
  onRequestClear,
  onClose,
}: ClipboardSidebarProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());

  const rootCount = roots.length;

  const toggleCollapsed = (nodeId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const totalCards = useMemo(() => {
    let count = 0;
    const walk = (nodes: TaskNode[]) => {
      for (const n of nodes) {
        count += 1;
        walk(n.children);
      }
    };
    walk(roots);
    return count;
  }, [roots]);

  if (!open) return null;

  return (
    <aside
      className="flex w-72 min-w-[16rem] max-w-[85vw] shrink-0 flex-col border-l border-slate-200/80 bg-slate-50/60"
      aria-label="Zwischenablage"
    >
      <div className="flex items-start justify-between gap-2 border-b border-slate-200/80 bg-white px-3 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Zwischenablage</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {rootCount === 0
              ? "Karten aus dem Baum hierher ziehen"
              : `${rootCount} Stamm${rootCount === 1 ? "" : "e"}, ${totalCards} Karte${totalCards === 1 ? "" : "n"} gesamt`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
        >
          Schließen
        </button>
      </div>

      <ClipboardSidebarDropZone empty={roots.length === 0}>
        {roots.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-6 text-center text-xs text-slate-500">
            Noch leer. Ziehe Karten auf „Zwischenablage“ in der Leiste oder hierher.
          </p>
        ) : (
          <ClipboardTree
            nodes={roots}
            listParentId={null}
            depth={0}
            collapsedIds={collapsedIds}
            onToggleCollapsed={toggleCollapsed}
            activeDragId={activeDragId}
            activeOverGap={activeOverGap}
          />
        )}
      </ClipboardSidebarDropZone>

      <div className="border-t border-slate-200/80 bg-white p-3">
        <button
          type="button"
          disabled={roots.length === 0}
          onClick={onRequestClear}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Zwischenablage leeren
        </button>
      </div>
    </aside>
  );
}

function ClipboardSidebarDropZone({
  children,
  empty,
}: {
  children: ReactNode;
  empty: boolean;
}) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: CLIPBOARD_SIDEBAR_DROP_ID,
    data: { kind: "clipboardSidebar" as const },
  });
  const fromBoard = Boolean(active) && active?.data.current?.source !== "clipboard";

  return (
    <div
      ref={setNodeRef}
      data-clipboard-drop="sidebar"
      className={[
        "min-h-0 flex-1 overflow-auto p-2 transition-colors",
        isOver && fromBoard
          ? "bg-violet-100/80 ring-2 ring-inset ring-violet-400"
          : empty && fromBoard
            ? "bg-violet-50/40"
            : "",
      ].join(" ")}
    >
      {children}
    </div>
  );
}
