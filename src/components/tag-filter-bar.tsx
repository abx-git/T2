"use client";

import { AlarmClock, CalendarDays, ListFilter, Palette, Tag, X } from "lucide-react";
import { useMemo } from "react";

import {
  cardColorLabel,
  cardColorSwatchClass,
  collectColorsFromForest,
  collectScheduleKindsFromForest,
  colorsAvailableForFilter,
  SCHEDULE_FILTER_LABELS,
  scheduleKindsAvailableForFilter,
  type ScheduleFilterKind,
} from "@/lib/board-filters";
import type { CardColorId } from "@/lib/card-color";
import {
  collectFilterMatchingCards,
  hasActiveFacetFilters,
} from "@/lib/filter-results";
import { collectAllTagsFromForest, tagChipClass, tagsAvailableForFilter } from "@/lib/task-tags";
import { useTaskTreeStore } from "@/store/task-tree-store";

type TagFilterBarProps = {
  onOpenResults: () => void;
};

const chipBase =
  "inline-flex max-w-full items-center truncate rounded border px-1.5 py-px text-[10px] font-medium leading-tight";

export function TagFilterBar({ onOpenResults }: TagFilterBarProps) {
  const roots = useTaskTreeStore((s) => s.roots);
  const completedTag = useTaskTreeStore((s) => s.completedTag);
  const filterTags = useTaskTreeStore((s) => s.filterTags);
  const addFilterTag = useTaskTreeStore((s) => s.addFilterTag);
  const removeFilterTag = useTaskTreeStore((s) => s.removeFilterTag);
  const filterColors = useTaskTreeStore((s) => s.filterColors);
  const addFilterColor = useTaskTreeStore((s) => s.addFilterColor);
  const removeFilterColor = useTaskTreeStore((s) => s.removeFilterColor);
  const filterScheduleKinds = useTaskTreeStore((s) => s.filterScheduleKinds);
  const addFilterScheduleKind = useTaskTreeStore((s) => s.addFilterScheduleKind);
  const removeFilterScheduleKind = useTaskTreeStore((s) => s.removeFilterScheduleKind);
  const filterCombineMode = useTaskTreeStore((s) => s.filterCombineMode);
  const setFilterCombineMode = useTaskTreeStore((s) => s.setFilterCombineMode);
  const clearBoardFilters = useTaskTreeStore((s) => s.clearBoardFilters);

  const allTags = useMemo(() => collectAllTagsFromForest(roots), [roots]);
  const availableTags = useMemo(
    () => tagsAvailableForFilter(allTags, filterTags),
    [allTags, filterTags],
  );

  const allColors = useMemo(() => collectColorsFromForest(roots), [roots]);
  const availableColors = useMemo(
    () => colorsAvailableForFilter(allColors, filterColors),
    [allColors, filterColors],
  );

  const allScheduleKinds = useMemo(() => collectScheduleKindsFromForest(roots), [roots]);
  const availableScheduleKinds = useMemo(
    () => scheduleKindsAvailableForFilter(allScheduleKinds, filterScheduleKinds),
    [allScheduleKinds, filterScheduleKinds],
  );

  const hasTagFilters = allTags.length > 0 || filterTags.length > 0;
  const hasColorFilters = allColors.length > 0 || filterColors.length > 0;
  const hasScheduleFilters = allScheduleKinds.length > 0 || filterScheduleKinds.length > 0;
  const hasAnyActiveFilter = hasActiveFacetFilters({
    filterTags,
    filterColors,
    filterScheduleKinds,
  });

  const filterHitCount = useMemo(() => {
    if (!hasAnyActiveFilter) return 0;
    return collectFilterMatchingCards(roots, {
      filterTags,
      filterColors,
      filterScheduleKinds,
      filterCombineMode,
      completedTag,
      includeDone: true,
    }).length;
  }, [
    hasAnyActiveFilter,
    roots,
    filterTags,
    filterColors,
    filterScheduleKinds,
    filterCombineMode,
    completedTag,
  ]);

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-t border-slate-100/90 px-6 py-2"
      role="group"
      aria-label="Filter und Termine"
    >
      <button
        type="button"
        onClick={onOpenResults}
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-violet-300/90 bg-violet-50 px-2.5 text-[11px] font-medium text-violet-900 shadow-sm hover:bg-violet-100"
        title={
          hasAnyActiveFilter
            ? "Trefferliste zum aktuellen Filter öffnen"
            : "Alle Fälligkeiten und Erinnerungen anzeigen"
        }
      >
        {hasAnyActiveFilter ? (
          <ListFilter className="h-3.5 w-3.5 shrink-0" aria-hidden />
        ) : (
          <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
        )}
        {hasAnyActiveFilter ? `Treffer (${filterHitCount})` : "Termine"}
      </button>

      <div
        className="flex items-center gap-0.5 rounded-lg border border-slate-200/90 bg-slate-50/80 p-0.5"
        role="group"
        aria-label="Filter-Verknüpfung"
      >
        <button
          type="button"
          onClick={() => setFilterCombineMode("and")}
          className={[
            "flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-sm font-semibold leading-none transition",
            filterCombineMode === "and"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900",
          ].join(" ")}
          aria-pressed={filterCombineMode === "and"}
          aria-label="UND: alle Filterkriterien müssen erfüllt sein"
          title="UND — alle Filterkriterien müssen erfüllt sein"
        >
          <span aria-hidden>∧</span>
        </button>
        <button
          type="button"
          onClick={() => setFilterCombineMode("or")}
          className={[
            "flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-sm font-semibold leading-none transition",
            filterCombineMode === "or"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900",
          ].join(" ")}
          aria-pressed={filterCombineMode === "or"}
          aria-label="ODER: mindestens ein Filterkriterium muss erfüllt sein"
          title="ODER — mindestens ein Filterkriterium muss erfüllt sein"
        >
          <span aria-hidden>∨</span>
        </button>
      </div>

      {hasScheduleFilters ? (
        <>
          <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
            <AlarmClock className="h-3 w-3" aria-hidden />
            Zeit
          </span>
          {filterScheduleKinds.map((kind) => (
            <ScheduleFilterChip
              key={kind}
              kind={kind}
              active
              onClick={() => removeFilterScheduleKind(kind)}
            />
          ))}
          {availableScheduleKinds.map((kind) => (
            <ScheduleFilterChip
              key={kind}
              kind={kind}
              onClick={() => addFilterScheduleKind(kind)}
            />
          ))}
        </>
      ) : null}

      {hasColorFilters ? (
        <>
          <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
            <Palette className="h-3 w-3" aria-hidden />
            Farben
          </span>
          {filterColors.map((color) => (
            <ColorFilterChip
              key={color}
              color={color}
              active
              onClick={() => removeFilterColor(color)}
            />
          ))}
          {availableColors.map((color) => (
            <ColorFilterChip
              key={color}
              color={color}
              onClick={() => addFilterColor(color)}
            />
          ))}
        </>
      ) : null}

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
                "inline-flex items-center gap-0.5",
                tagChipClass(t),
                "border-sky-400/90",
              ].join(" ")}
              title="Filter entfernen"
              aria-label={`Filter „${t}“ entfernen`}
            >
              {t}
              <X className="h-3 w-3 opacity-70" aria-hidden />
            </button>
          ))}
          {availableTags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => addFilterTag(t)}
              className={[tagChipClass(t), "transition hover:border-sky-400"].join(" ")}
              title="Nach diesem Tag filtern"
              aria-label={`Nach Tag „${t}“ filtern`}
            >
              {t}
            </button>
          ))}
        </>
      ) : null}

      {hasAnyActiveFilter ? (
        <button
          type="button"
          onClick={() => clearBoardFilters()}
          className="ml-1 text-[11px] text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
        >
          Alle Filter löschen
        </button>
      ) : null}
    </div>
  );
}

function ScheduleFilterChip({
  kind,
  active,
  onClick,
}: {
  kind: ScheduleFilterKind;
  active?: boolean;
  onClick: () => void;
}) {
  const label = SCHEDULE_FILTER_LABELS[kind];
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        chipBase,
        "gap-0.5 transition",
        active
          ? "border-sky-400/90 bg-sky-50 text-sky-900"
          : "border-slate-300 bg-slate-50 text-slate-700 hover:border-sky-400",
      ].join(" ")}
      title={active ? "Filter entfernen" : `Nach „${label}“ filtern`}
      aria-label={active ? `Filter „${label}“ entfernen` : `Nach „${label}“ filtern`}
    >
      {label}
      {active ? <X className="h-3 w-3 opacity-70" aria-hidden /> : null}
    </button>
  );
}

function ColorFilterChip({
  color,
  active,
  onClick,
}: {
  color: CardColorId;
  active?: boolean;
  onClick: () => void;
}) {
  const label = cardColorLabel(color);
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        chipBase,
        "gap-1 transition",
        active
          ? "border-sky-400/90 bg-white text-slate-800"
          : "border-slate-300 bg-white text-slate-700 hover:border-sky-400",
      ].join(" ")}
      title={active ? "Filter entfernen" : `Nach Farbe „${label}“ filtern`}
      aria-label={active ? `Farbfilter „${label}“ entfernen` : `Nach Farbe „${label}“ filtern`}
    >
      <span
        className={["h-2.5 w-2.5 shrink-0 rounded-sm", cardColorSwatchClass(color)].join(" ")}
        aria-hidden
      />
      {label}
      {active ? <X className="h-3 w-3 opacity-70" aria-hidden /> : null}
    </button>
  );
}
