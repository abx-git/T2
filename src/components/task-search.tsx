"use client";

import { Search } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { searchTaskNodes } from "@/lib/task-search";
import { useTaskTreeStore } from "@/store/task-tree-store";

type TaskSearchProps = {
  onSelectNode: (nodeId: string) => void;
};

export function TaskSearch({ onSelectNode }: TaskSearchProps) {
  const roots = useTaskTreeStore((s) => s.roots);
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const hits = useMemo(() => searchTaskNodes(roots, query), [roots, query]);
  const showDropdown = open && query.trim().length > 0;

  useEffect(() => {
    setActiveIndex(hits.length > 0 ? 0 : -1);
  }, [hits]);

  useEffect(() => {
    if (!showDropdown) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root || !(e.target instanceof Node) || root.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [showDropdown]);

  const pick = useCallback(
    (nodeId: string) => {
      onSelectNode(nodeId);
      setQuery("");
      setOpen(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
    },
    [onSelectNode],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!showDropdown || hits.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? hits.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      const hit = hits[activeIndex];
      if (hit) pick(hit.nodeId);
    }
  };

  return (
    <div ref={rootRef} className="relative min-w-[12rem] max-w-md flex-1">
      <label className="sr-only" htmlFor={`${listboxId}-input`}>
        Karten suchen
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          ref={inputRef}
          id={`${listboxId}-input`}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (query.trim()) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder="Karten suchen …"
          autoComplete="off"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? `${listboxId}-listbox` : undefined}
          aria-activedescendant={
            showDropdown && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
          }
          className="h-9 w-full rounded-lg border border-slate-200/90 bg-slate-50/80 py-1.5 pr-3 pl-8 text-sm text-slate-900 outline-none ring-sky-500/30 placeholder:text-slate-400 focus:border-sky-300 focus:bg-white focus:ring-2"
        />
      </div>
      {showDropdown ? (
        <ul
          id={`${listboxId}-listbox`}
          role="listbox"
          className="absolute top-[calc(100%+4px)] z-50 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-900/5"
        >
          {hits.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500" role="option" aria-selected={false}>
              Keine Treffer
            </li>
          ) : (
            hits.map((hit, index) => (
              <li key={hit.nodeId} role="presentation">
                <button
                  type="button"
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => pick(hit.nodeId)}
                  className={[
                    "flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm transition",
                    index === activeIndex ? "bg-sky-50 text-sky-950" : "text-slate-900 hover:bg-slate-50",
                  ].join(" ")}
                >
                  <span className="font-medium leading-snug">{hit.title}</span>
                  {hit.breadcrumb ? (
                    <span className="truncate text-[11px] text-slate-500">{hit.breadcrumb}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
