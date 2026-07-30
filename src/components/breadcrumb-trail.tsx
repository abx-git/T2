"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import type { TaskNode } from "@/types/task-node";

export interface BreadcrumbTrailProps {
  path: TaskNode[];
  onNavigateRoot: () => void;
  onNavigateTo: (nodeId: string) => void;
  onDrillUp: () => void;
}

export function BreadcrumbTrail({
  path,
  onNavigateRoot,
  onNavigateTo,
  onDrillUp,
}: BreadcrumbTrailProps) {
  return (
    <nav
      className="flex min-w-0 flex-wrap items-center gap-1 text-sm"
      aria-label="Pfad"
    >
      <button
        type="button"
        onClick={onDrillUp}
        disabled={path.length === 0}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        title="Eine Ebene höher"
        aria-label="Eine Ebene höher"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={onNavigateRoot}
        className={[
          "rounded-md px-2 py-1 text-xs font-medium transition",
          path.length === 0
            ? "bg-sky-50 text-sky-900"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        ].join(" ")}
      >
        Übersicht
      </button>
      {path.map((node, i) => {
        const isLast = i === path.length - 1;
        return (
          <span key={node.id} className="flex min-w-0 items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
            <button
              type="button"
              onClick={() => onNavigateTo(node.id)}
              className={[
                "max-w-[12rem] truncate rounded-md px-2 py-1 text-xs font-medium transition",
                isLast
                  ? "bg-sky-50 text-sky-900"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              ].join(" ")}
              title={node.title.trim() || "(Ohne Titel)"}
            >
              {node.title.trim() || "(Ohne Titel)"}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
