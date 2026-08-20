"use client";

import {
  CircleHelp,
  Columns2,
  ListTree,
  MoreHorizontal,
  SlidersHorizontal,
  Square,
  Tag,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { DepthLevelsControl } from "./depth-levels-control";

export interface BoardHeaderMoreMenuProps {
  boardMaxVisibleLevels: number;
  splitAvailable: boolean;
  splitViewEnabled: boolean;
  onSplitViewChange: (on: boolean) => void;
  lightModeEnabled: boolean;
  onLightModeChange: (on: boolean) => void;
  onApplyBoardDepth: (level: number) => void;
  onExpandBoardDepth: () => void;
  onApplyCardDepth: (level: number) => void;
  onExpandCardDepth: () => void;
  onOpenTagRename: () => void;
  onOpenCardFields: () => void;
  onOpenHelp: () => void;
}

const itemClass =
  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900";

/** Sekundäre Board-Aktionen hinter einem „Mehr“-Menü. */
export function BoardHeaderMoreMenu({
  boardMaxVisibleLevels,
  splitAvailable,
  splitViewEnabled,
  onSplitViewChange,
  lightModeEnabled,
  onLightModeChange,
  onApplyBoardDepth,
  onExpandBoardDepth,
  onApplyCardDepth,
  onExpandCardDepth,
  onOpenTagRename,
  onOpenCardFields,
  onOpenHelp,
}: BoardHeaderMoreMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || rootRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const closeAnd = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          "flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800",
          open ? "bg-slate-100 text-slate-800" : "",
        ].join(" ")}
        title="Weitere Aktionen"
        aria-label="Weitere Aktionen"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-40 mt-1.5 w-64 origin-top-right rounded-xl border border-slate-200/90 bg-white p-1.5 shadow-lg shadow-slate-900/10"
        >
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={lightModeEnabled}
            className={itemClass}
            onClick={() => onLightModeChange(!lightModeEnabled)}
          >
            <ListTree
              className={[
                "h-3.5 w-3.5 shrink-0",
                lightModeEnabled ? "text-sky-600" : "",
              ].join(" ")}
              aria-hidden
            />
            <span className="flex-1">Light-Modus</span>
            <span className="text-[10px] font-normal text-slate-400">
              {lightModeEnabled ? "an" : "aus"}
            </span>
          </button>

          {splitAvailable && !lightModeEnabled ? (
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={splitViewEnabled}
              className={itemClass}
              onClick={() => onSplitViewChange(!splitViewEnabled)}
            >
              {splitViewEnabled ? (
                <Columns2 className="h-3.5 w-3.5 shrink-0 text-sky-600" aria-hidden />
              ) : (
                <Square className="h-3.5 w-3.5 shrink-0" aria-hidden />
              )}
              <span className="flex-1">Split-Ansicht</span>
              <span className="text-[10px] font-normal text-slate-400">
                {splitViewEnabled ? "an" : "aus"}
              </span>
            </button>
          ) : null}

          {boardMaxVisibleLevels > 1 ? (
            <div className="mt-1 space-y-1.5 border-t border-slate-100 px-1 pb-1.5 pt-2">
              <p className="px-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                Ebenen
              </p>
              <DepthLevelsControl
                label="Struktur"
                maxLevel={boardMaxVisibleLevels}
                onApplyLevel={onApplyBoardDepth}
                onExpandAll={onExpandBoardDepth}
                className="w-full justify-between border-0 bg-slate-50 px-1"
              />
              {!lightModeEnabled ? (
                <DepthLevelsControl
                  label="Karten"
                  maxLevel={boardMaxVisibleLevels}
                  onApplyLevel={onApplyCardDepth}
                  onExpandAll={onExpandCardDepth}
                  className="w-full justify-between border-0 bg-slate-50 px-1"
                />
              ) : null}
            </div>
          ) : null}

          <div className="mt-1 border-t border-slate-100 pt-1">
            {!lightModeEnabled ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className={itemClass}
                  onClick={() => closeAnd(onOpenTagRename)}
                >
                  <Tag className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Tags umbenennen
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={itemClass}
                  onClick={() => closeAnd(onOpenCardFields)}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Kartenfelder
                </button>
              </>
            ) : null}
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={() => closeAnd(onOpenHelp)}
            >
              <CircleHelp className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Hilfe &amp; Tastatur
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
