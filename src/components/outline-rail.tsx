"use client";

import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeft } from "lucide-react";
import { useMemo, useState } from "react";

import { buildBoardOutlineRows } from "@/lib/board-outline";
import { computeFocusRowTreeGuides } from "@/lib/focus-mode-outline";
import { isTaskMarkedDone } from "@/lib/task-tags";
import type { TaskNode } from "@/types/task-node";

export interface OutlineRailProps {
  roots: TaskNode[];
  collapsedIds: ReadonlySet<string>;
  contextNodeId: string | null;
  hideCompletedTasks: boolean;
  completedTag: string;
  onSelectNode: (nodeId: string) => void;
  onToggleCollapsed: (nodeId: string) => void;
  /** Controlled open state optional — defaults to open on desktop. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function OutlineRail({
  roots,
  collapsedIds,
  contextNodeId,
  hideCompletedTasks,
  completedTag,
  onSelectNode,
  onToggleCollapsed,
  open: openProp,
  onOpenChange,
}: OutlineRailProps) {
  const [internalOpen, setInternalOpen] = useState(true);
  const open = openProp ?? internalOpen;
  const setOpen = (v: boolean) => {
    onOpenChange?.(v);
    if (openProp === undefined) setInternalOpen(v);
  };

  const rows = useMemo(
    () => buildBoardOutlineRows(roots, hideCompletedTasks, completedTag, collapsedIds),
    [roots, hideCompletedTasks, completedTag, collapsedIds],
  );

  const rowsById = useMemo(() => {
    const m = new Map(rows.map((r) => [r.node.id, r]));
    return m;
  }, [rows]);

  if (!open) {
    return (
      <div className="flex w-10 shrink-0 flex-col items-center border-r border-slate-200 bg-slate-50/80 py-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-slate-800"
          title="Outline zeigen"
          aria-label="Outline zeigen"
        >
          <PanelLeft className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-50/90 md:w-64">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-2 py-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Outline
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-white hover:text-slate-700"
          title="Outline einklappen"
          aria-label="Outline einklappen"
        >
          <PanelLeftClose className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
        {rows.length === 0 ? (
          <p className="px-2 py-4 text-xs text-slate-500">Noch keine Karten.</p>
        ) : (
          <ul className="space-y-px">
            {rows.map((row) => {
              const guides = computeFocusRowTreeGuides(row, rowsById);
              const selected = contextNodeId === row.node.id;
              const done = isTaskMarkedDone(row.node, completedTag);
              const hasChildren = row.node.children.length > 0;
              const collapsed = collapsedIds.has(row.node.id);
              return (
                <li key={row.node.id}>
                  <div
                    className={[
                      "group flex items-center gap-0.5 rounded-md px-0.5 py-0.5 text-left text-xs",
                      selected
                        ? "bg-sky-100/90 text-sky-950"
                        : "text-slate-700 hover:bg-white",
                    ].join(" ")}
                    style={{ paddingLeft: `${4 + row.depth * 12}px` }}
                  >
                    {hasChildren ? (
                      <button
                        type="button"
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:text-slate-700"
                        aria-label={collapsed ? "Aufklappen" : "Zuklappen"}
                        onClick={() => onToggleCollapsed(row.node.id)}
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
                    <button
                      type="button"
                      className={[
                        "min-w-0 flex-1 truncate py-0.5 text-left",
                        done ? "text-slate-400 line-through" : "",
                      ].join(" ")}
                      title={[...guides.map(() => ""), row.node.title].join("")}
                      onClick={() => onSelectNode(row.node.id)}
                    >
                      {row.node.title.trim() || "(Ohne Titel)"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
