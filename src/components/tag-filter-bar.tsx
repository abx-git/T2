"use client";

import { CalendarDays, Tag, X } from "lucide-react";
import { useMemo } from "react";

import { collectAllTagsFromForest, tagChipClass, tagsAvailableForFilter } from "@/lib/task-tags";
import { useTaskTreeStore } from "@/store/task-tree-store";

type TagFilterBarProps = {
  onOpenAppointments: () => void;
};

export function TagFilterBar({ onOpenAppointments }: TagFilterBarProps) {
  const roots = useTaskTreeStore((s) => s.roots);
  const filterTags = useTaskTreeStore((s) => s.filterTags);
  const addFilterTag = useTaskTreeStore((s) => s.addFilterTag);
  const removeFilterTag = useTaskTreeStore((s) => s.removeFilterTag);
  const clearFilterTags = useTaskTreeStore((s) => s.setFilterTags);

  const allTags = useMemo(() => collectAllTagsFromForest(roots), [roots]);
  const available = useMemo(
    () => tagsAvailableForFilter(allTags, filterTags),
    [allTags, filterTags],
  );

  const hasTagFilters = allTags.length > 0 || filterTags.length > 0;

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-t border-slate-100/90 px-6 py-2"
      role="group"
      aria-label="Filter und Termine"
    >
      <button
        type="button"
        onClick={onOpenAppointments}
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-violet-300/90 bg-violet-50 px-2.5 text-[11px] font-medium text-violet-900 shadow-sm hover:bg-violet-100"
        title="Alle Fälligkeiten und Erinnerungen als Markdown kopieren"
      >
        <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Termine
      </button>
      {hasTagFilters ? (
        <>
          <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
            <Tag className="h-3 w-3" aria-hidden />
            Tags
          </span>
          {filterTags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => removeFilterTag(t)}
              className={[
                "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
                tagChipClass(t),
                "ring-sky-300/90",
              ].join(" ")}
              title="Filter entfernen"
              aria-label={`Filter „${t}“ entfernen`}
            >
              {t}
              <X className="h-3 w-3 opacity-70" aria-hidden />
            </button>
          ))}
          {available.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => addFilterTag(t)}
              className={[
                "rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 transition hover:ring-sky-300/80",
                tagChipClass(t),
              ].join(" ")}
              title="Nach diesem Tag filtern"
              aria-label={`Nach Tag „${t}“ filtern`}
            >
              {t}
            </button>
          ))}
          {filterTags.length > 0 ? (
            <button
              type="button"
              onClick={() => clearFilterTags([])}
              className="ml-1 text-[11px] text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
            >
              Alle Filter löschen
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
