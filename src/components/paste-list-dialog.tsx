"use client";

import { ClipboardPaste, List } from "lucide-react";
import { useId, useLayoutEffect, useState } from "react";

import {
  buildPasteListCards,
  parsePasteListLines,
  type PasteListMode,
} from "@/lib/paste-list-import";

export interface PasteListDialogProps {
  open: boolean;
  title: string;
  hint?: string;
  onClose: () => void;
  onApply: (cards: { title: string; description: string }[]) => void;
}

type Step = "input" | "mode" | "single-split";

async function readClipboardText(): Promise<string | null> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
      return await navigator.clipboard.readText();
    }
  } catch {
    // Berechtigung verweigert oder nicht verfügbar
  }
  return null;
}

export function PasteListDialog({ open, title, hint, onClose, onApply }: PasteListDialogProps) {
  const titleId = useId();
  const areaId = useId();
  const [draft, setDraft] = useState("");
  const [step, setStep] = useState<Step>("input");
  const [lines, setLines] = useState<string[]>([]);
  const [mode, setMode] = useState<PasteListMode>("per-line");
  const [splitTitleDescription, setSplitTitleDescription] = useState(true);
  const [clipboardError, setClipboardError] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    setDraft("");
    setStep("input");
    setLines([]);
    setMode("per-line");
    setSplitTitleDescription(true);
    setClipboardError(null);
  }, [open]);

  if (!open) return null;

  const finish = (nextLines: string[], nextMode: PasteListMode, split: boolean) => {
    const cards = buildPasteListCards(nextLines, nextMode, split);
    if (cards.length === 0) {
      window.alert("Keine Zeilen erkannt.");
      return;
    }
    onApply(cards);
  };

  const handleContinueFromInput = () => {
    const parsed = parsePasteListLines(draft);
    if (parsed.length === 0) {
      window.alert("Kein Inhalt — bitte mindestens eine Zeile einfügen.");
      return;
    }
    if (parsed.length === 1) {
      finish(parsed, "single", false);
      return;
    }
    setLines(parsed);
    setStep("mode");
  };

  const handleModeNext = () => {
    if (mode === "per-line") {
      finish(lines, "per-line", false);
      return;
    }
    setStep("single-split");
  };

  const handlePasteFromClipboard = async () => {
    setClipboardError(null);
    const text = await readClipboardText();
    if (text === null) {
      setClipboardError("Zwischenablage nicht lesbar — bitte manuell einfügen (Strg+V / Cmd+V).");
      return;
    }
    setDraft(text);
  };

  const previewCount =
    step === "mode" && mode === "per-line"
      ? lines.length
      : step === "single-split"
        ? 1
        : null;

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
        <div className="shrink-0 border-b border-slate-100 px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold text-slate-900">
            {title}
          </h2>
          {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
        </div>

        {step === "input" ? (
          <>
            <div className="min-h-0 flex-1 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <label htmlFor={areaId} className="text-[11px] font-medium text-slate-500">
                  Liste einfügen (eine Zeile pro Eintrag)
                </label>
                <button
                  type="button"
                  onClick={() => void handlePasteFromClipboard()}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  <ClipboardPaste className="h-3 w-3" aria-hidden />
                  Aus Zwischenablage
                </button>
              </div>
              {clipboardError ? (
                <p className="mb-2 text-[11px] text-amber-700">{clipboardError}</p>
              ) : null}
              <textarea
                id={areaId}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                spellCheck={false}
                placeholder={"Einkaufen\nMilch\nBrot\n…"}
                className="h-[min(55vh,28rem)] w-full resize-y rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-800 outline-none focus:ring-2 focus:ring-sky-400/50"
              />
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-4 py-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleContinueFromInput}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
              >
                Weiter
              </button>
            </div>
          </>
        ) : null}

        {step === "mode" ? (
          <>
            <div className="flex-1 space-y-3 p-4">
              <p className="text-sm text-slate-700">
                <span className="font-medium">{lines.length} Zeilen</span> erkannt. Wie sollen die
                Karten angelegt werden?
              </p>
              <fieldset className="space-y-2">
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 has-[:checked]:border-sky-400 has-[:checked]:bg-sky-50/50">
                  <input
                    type="radio"
                    name="paste-list-mode"
                    checked={mode === "per-line"}
                    onChange={() => setMode("per-line")}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-900">
                      Jede Zeile als eigene Karte
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {lines.length} Karten mit jeweils einer Zeile als Titel
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 has-[:checked]:border-sky-400 has-[:checked]:bg-sky-50/50">
                  <input
                    type="radio"
                    name="paste-list-mode"
                    checked={mode === "single"}
                    onChange={() => setMode("single")}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-900">
                      Alles als eine Karte
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Der gesamte Text wird zu einer einzelnen Karte
                    </span>
                  </span>
                </label>
              </fieldset>
            </div>
            <div className="flex shrink-0 justify-between gap-2 border-t border-slate-100 px-4 py-3">
              <button
                type="button"
                onClick={() => setStep("input")}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Zurück
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={handleModeNext}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                >
                  {mode === "per-line" ? `${previewCount} Karten anlegen` : "Weiter"}
                </button>
              </div>
            </div>
          </>
        ) : null}

        {step === "single-split" ? (
          <>
            <div className="flex-1 space-y-3 p-4">
              <p className="text-sm text-slate-700">
                Soll die <span className="font-medium">erste Zeile als Titel</span> und der{" "}
                <span className="font-medium">Rest als Beschreibung</span> eingefügt werden?
              </p>
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
                <p className="font-medium text-slate-800">Titel</p>
                <p className="mt-1 whitespace-pre-wrap">{lines[0]}</p>
                {lines.length > 1 ? (
                  <>
                    <p className="mt-3 font-medium text-slate-800">Beschreibung</p>
                    <p className="mt-1 whitespace-pre-wrap">{lines.slice(1).join("\n")}</p>
                  </>
                ) : null}
              </div>
              <fieldset className="space-y-2">
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 has-[:checked]:border-sky-400 has-[:checked]:bg-sky-50/50">
                  <input
                    type="radio"
                    name="paste-list-split"
                    checked={splitTitleDescription}
                    onChange={() => setSplitTitleDescription(true)}
                    className="mt-0.5"
                  />
                  <span className="text-sm text-slate-900">Ja — erste Zeile Titel, Rest Beschreibung</span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 has-[:checked]:border-sky-400 has-[:checked]:bg-sky-50/50">
                  <input
                    type="radio"
                    name="paste-list-split"
                    checked={!splitTitleDescription}
                    onChange={() => setSplitTitleDescription(false)}
                    className="mt-0.5"
                  />
                  <span className="text-sm text-slate-900">
                    Nein — gesamter Text als Titel (ohne Beschreibung)
                  </span>
                </label>
              </fieldset>
            </div>
            <div className="flex shrink-0 justify-between gap-2 border-t border-slate-100 px-4 py-3">
              <button
                type="button"
                onClick={() => setStep("mode")}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Zurück
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={() => finish(lines, "single", splitTitleDescription)}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                >
                  <List className="h-3.5 w-3.5" aria-hidden />
                  1 Karte anlegen
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
