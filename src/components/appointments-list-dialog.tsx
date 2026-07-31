"use client";

import { AlarmClock, CalendarDays, CheckCircle2, ChevronRight } from "lucide-react";
import { useId, useLayoutEffect, useMemo, useState } from "react";

import { startOfLocalDay } from "@/lib/aggregates";
import {
  collectAppointmentsFromForest,
  formatAppointmentsMarkdown,
  type AppointmentEntry,
  type AppointmentsMarkdownStyle,
} from "@/lib/appointments-export";
import { cardColorAccentClass, cardColorClass } from "@/lib/card-color";
import { isDateOnlyDue } from "@/lib/task-datetime";
import { findNodeById } from "@/lib/tree-utils";
import { useTaskTreeStore } from "@/store/task-tree-store";

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* execCommand fallback */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

const STYLE_LABELS: Record<AppointmentsMarkdownStyle, string> = {
  plain: "Markdown (einfach)",
  obsidian: "Obsidian Tasks",
};

type ViewMode = "list" | "export";

const KIND_LABEL: Record<AppointmentEntry["kind"], string> = {
  due: "Fällig",
  reminder: "Erinnerung",
};

function dayKey(d: Date): string {
  const x = startOfLocalDay(d);
  return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
}

function dayHeading(d: Date, now: Date): string {
  const day = startOfLocalDay(d).getTime();
  const today = startOfLocalDay(now).getTime();
  const tomorrow = today + 24 * 60 * 60 * 1000;
  if (day === today) return "Heute";
  if (day === tomorrow) return "Morgen";
  if (day === today - 24 * 60 * 60 * 1000) return "Gestern";
  return d.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function timeLabel(entry: AppointmentEntry): string {
  if (isDateOnlyDue(entry.date)) return "ganztägig";
  return entry.date.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pathTrail(pathTitles: string[]): string {
  if (pathTitles.length <= 1) return "";
  return pathTitles.slice(0, -1).join(" › ");
}

function groupAppointments(entries: AppointmentEntry[]): { key: string; label: string; entries: AppointmentEntry[] }[] {
  const now = new Date();
  const groups: { key: string; label: string; entries: AppointmentEntry[] }[] = [];
  const index = new Map<string, number>();

  for (const entry of entries) {
    const key = dayKey(entry.date);
    let i = index.get(key);
    if (i === undefined) {
      i = groups.length;
      index.set(key, i);
      groups.push({ key, label: dayHeading(entry.date, now), entries: [] });
    }
    groups[i]!.entries.push(entry);
  }
  return groups;
}

export interface AppointmentsListDialogProps {
  open: boolean;
  onClose: () => void;
  /** Karte im Board anzeigen (und ggf. Details öffnen). */
  onSelectAppointment?: (nodeId: string) => void;
}

export function AppointmentsListDialog({
  open,
  onClose,
  onSelectAppointment,
}: AppointmentsListDialogProps) {
  const roots = useTaskTreeStore((s) => s.roots);
  const completedTag = useTaskTreeStore((s) => s.completedTag);

  const titleId = useId();
  const areaId = useId();
  const [view, setView] = useState<ViewMode>("list");
  const [style, setStyle] = useState<AppointmentsMarkdownStyle>("plain");
  const [includeDone, setIncludeDone] = useState(true);
  const [copied, setCopied] = useState(false);

  const entries = useMemo(
    () =>
      collectAppointmentsFromForest(roots, {
        completedTag,
        includeDone,
      }),
    [roots, completedTag, includeDone],
  );

  const groups = useMemo(() => groupAppointments(entries), [entries]);

  const openCount = useMemo(() => entries.filter((e) => !e.done).length, [entries]);
  const overdueCount = useMemo(
    () => entries.filter((e) => e.overdue && !e.done).length,
    [entries],
  );

  const plainText = useMemo(
    () =>
      formatAppointmentsMarkdown(roots, {
        style: "plain",
        completedTag,
        includeDone,
      }),
    [roots, completedTag, includeDone],
  );

  const obsidianText = useMemo(
    () =>
      formatAppointmentsMarkdown(roots, {
        style: "obsidian",
        completedTag,
        includeDone,
      }),
    [roots, completedTag, includeDone],
  );

  const text = style === "plain" ? plainText : obsidianText;

  useLayoutEffect(() => {
    if (!open) {
      setView("list");
      setStyle("plain");
      setIncludeDone(true);
      setCopied(false);
    }
  }, [open]);

  if (!open) return null;

  const handleCopy = async () => {
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      window.alert("In die Zwischenablage kopieren ist in diesem Kontext nicht möglich.");
    }
  };

  const handleSelect = (nodeId: string) => {
    onSelectAppointment?.(nodeId);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(92vh,44rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-100 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={titleId} className="text-sm font-semibold text-slate-900">
                Alle Termine
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Fälligkeiten und Erinnerungen, nach Datum sortiert
                {entries.length
                  ? ` — ${entries.length} Einträge${openCount < entries.length ? ` · ${openCount} offen` : ""}${
                      overdueCount ? ` · ${overdueCount} überfällig` : ""
                    }`
                  : ""}
                .
              </p>
            </div>
            <div
              className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5"
              role="tablist"
              aria-label="Ansicht"
            >
              {(
                [
                  { id: "list" as const, label: "Liste" },
                  { id: "export" as const, label: "Export" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={view === tab.id}
                  onClick={() => setView(tab.id)}
                  className={[
                    "rounded-md px-2.5 py-1 text-[11px] font-medium transition",
                    view === tab.id
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700",
                  ].join(" ")}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <label className="mt-3 flex cursor-pointer items-center gap-2 text-[11px] text-slate-600">
            <input
              type="checkbox"
              checked={includeDone}
              onChange={(e) => setIncludeDone(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500/30"
            />
            Erledigte Termine einbeziehen
          </label>

          {view === "export" ? (
            <>
              <div
                className="mt-3 flex flex-wrap items-center gap-2"
                role="group"
                aria-label="Markdown-Format"
              >
                {(Object.keys(STYLE_LABELS) as AppointmentsMarkdownStyle[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setStyle(key)}
                    className={[
                      "rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition",
                      style === key
                        ? "border-violet-300 bg-violet-50 text-violet-900"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    {STYLE_LABELS[key]}
                  </button>
                ))}
              </div>
              {style === "obsidian" ? (
                <p className="mt-2 text-[10px] text-slate-500">
                  Obsidian: <code className="text-slate-700">📅</code> Fällig,{" "}
                  <code className="text-slate-700">⏳</code> Erinnerung,{" "}
                  <code className="text-slate-700">✅</code> erledigt.
                </p>
              ) : (
                <p className="mt-2 text-[10px] text-slate-500">
                  Einfaches Markdown mit Datum, Art (Fällig/Erinnerung), Titel und Pfad im Board.
                </p>
              )}
            </>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {view === "list" ? (
            <div className="h-[min(58vh,30rem)] overflow-y-auto px-3 py-3">
              {!entries.length ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
                  <CalendarDays className="h-8 w-8 text-slate-300" aria-hidden />
                  <p className="text-sm font-medium text-slate-700">Keine Termine</p>
                  <p className="max-w-xs text-xs text-slate-500">
                    Sobald Karten eine Fälligkeit oder Erinnerung haben, erscheinen sie hier —
                    klickbar, um zur Karte zu springen.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {groups.map((group) => (
                    <section key={group.key} aria-labelledby={`day-${group.key}`}>
                      <h3
                        id={`day-${group.key}`}
                        className="sticky top-0 z-[1] -mx-1 mb-2 bg-white/95 px-1 py-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase backdrop-blur-sm"
                      >
                        {group.label}
                      </h3>
                      <ul className="space-y-1.5">
                        {group.entries.map((entry) => {
                          const node = findNodeById(roots, entry.nodeId);
                          const accent = cardColorAccentClass(node?.cardColor);
                          const surface = cardColorClass(node?.cardColor);
                          const trail = pathTrail(entry.pathTitles);
                          const KindIcon = entry.kind === "reminder" ? AlarmClock : CalendarDays;

                          return (
                            <li key={`${entry.nodeId}-${entry.kind}-${entry.date.getTime()}`}>
                              <button
                                type="button"
                                onClick={() => handleSelect(entry.nodeId)}
                                className={[
                                  "group relative flex w-full items-stretch gap-3 overflow-hidden rounded-xl border px-3 py-2.5 text-left transition",
                                  "hover:border-slate-300 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60",
                                  entry.done
                                    ? "border-slate-100 bg-slate-50/80 opacity-75"
                                    : entry.overdue
                                      ? "border-red-200/90 bg-red-50/70"
                                      : surface || "border-slate-200 bg-white",
                                ].join(" ")}
                              >
                                {accent ? (
                                  <span
                                    className={["absolute inset-y-0 left-0 w-1", accent].join(" ")}
                                    aria-hidden
                                  />
                                ) : null}

                                <div className="flex w-16 shrink-0 flex-col items-start justify-center pl-1">
                                  <span
                                    className={[
                                      "text-sm font-semibold tabular-nums",
                                      entry.overdue && !entry.done
                                        ? "text-red-700"
                                        : entry.done
                                          ? "text-slate-400"
                                          : "text-slate-800",
                                    ].join(" ")}
                                  >
                                    {timeLabel(entry)}
                                  </span>
                                  <span
                                    className={[
                                      "mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-medium",
                                      entry.kind === "reminder"
                                        ? "text-amber-700"
                                        : "text-violet-700",
                                    ].join(" ")}
                                  >
                                    <KindIcon className="h-3 w-3" aria-hidden />
                                    {KIND_LABEL[entry.kind]}
                                  </span>
                                </div>

                                <div className="min-w-0 flex-1 py-0.5">
                                  <div className="flex items-start gap-2">
                                    <p
                                      className={[
                                        "min-w-0 flex-1 text-sm font-medium leading-snug",
                                        entry.done
                                          ? "text-slate-500 line-through"
                                          : "text-slate-900",
                                      ].join(" ")}
                                    >
                                      {entry.title}
                                    </p>
                                    {entry.done ? (
                                      <CheckCircle2
                                        className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                                        aria-label="Erledigt"
                                      />
                                    ) : null}
                                  </div>
                                  {trail ? (
                                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                                      {trail}
                                    </p>
                                  ) : null}
                                  {entry.overdue && !entry.done ? (
                                    <p className="mt-1 text-[10px] font-medium text-red-600">
                                      Überfällig
                                    </p>
                                  ) : null}
                                </div>

                                <ChevronRight
                                  className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500"
                                  aria-hidden
                                />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="p-3">
              <label htmlFor={areaId} className="sr-only">
                Terminliste Export
              </label>
              <textarea
                id={areaId}
                readOnly
                value={text}
                spellCheck={false}
                className="h-[min(50vh,26rem)] w-full resize-y rounded-lg border border-slate-200 bg-slate-50/80 p-3 font-sans text-[11px] leading-relaxed whitespace-pre-wrap text-slate-800 outline-none focus:ring-2 focus:ring-sky-400/50"
              />
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Schließen
          </button>
          {view === "export" ? (
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              {copied ? "Kopiert" : "In Zwischenablage kopieren"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
