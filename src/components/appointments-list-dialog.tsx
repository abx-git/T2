"use client";

import { useId, useLayoutEffect, useMemo, useState } from "react";

import {
  formatAppointmentsMarkdown,
  type AppointmentsMarkdownStyle,
} from "@/lib/appointments-export";
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

export interface AppointmentsListDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AppointmentsListDialog({ open, onClose }: AppointmentsListDialogProps) {
  const roots = useTaskTreeStore((s) => s.roots);
  const completedTag = useTaskTreeStore((s) => s.completedTag);

  const titleId = useId();
  const areaId = useId();
  const [style, setStyle] = useState<AppointmentsMarkdownStyle>("plain");
  const [includeDone, setIncludeDone] = useState(true);
  const [copied, setCopied] = useState(false);

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
        className="flex max-h-[min(90vh,40rem)] w-full max-w-2xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="shrink-0 border-b border-slate-100 px-4 py-3"
        >
          <h2 id={titleId} className="text-sm font-semibold text-slate-900">
            Alle Termine
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Fälligkeiten und Erinnerungen aller Karten, nach Datum sortiert — zum Kopieren in Obsidian oder
            andere Notizen.
          </p>
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
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-slate-600">
            <input
              type="checkbox"
              checked={includeDone}
              onChange={(e) => setIncludeDone(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500/30"
            />
            Erledigte Termine einbeziehen
          </label>
          {style === "obsidian" ? (
            <p className="mt-2 text-[10px] text-slate-500">
              Obsidian: <code className="text-slate-700">📅</code> Fällig, <code className="text-slate-700">⏳</code>{" "}
              Erinnerung, <code className="text-slate-700">✅</code> erledigt.
            </p>
          ) : (
            <p className="mt-2 text-[10px] text-slate-500">
              Einfaches Markdown mit Datum, Art (Fällig/Erinnerung), Titel und Pfad im Board.
            </p>
          )}
        </div>
        <div
          className="min-h-0 flex-1 p-3"
        >
          <label htmlFor={areaId} className="sr-only">
            Terminliste
          </label>
          <textarea
            id={areaId}
            readOnly
            value={text}
            spellCheck={false}
            className="h-[min(50vh,26rem)] w-full resize-y rounded-lg border border-slate-200 bg-slate-50/80 p-3 font-sans text-[11px] leading-relaxed whitespace-pre-wrap text-slate-800 outline-none focus:ring-2 focus:ring-sky-400/50"
          />
        </div>
        <div
          className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-4 py-3"
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Schließen
          </button>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
          >
            {copied ? "Kopiert" : "In Zwischenablage kopieren"}
          </button>
        </div>
      </div>
    </div>
  );
}
