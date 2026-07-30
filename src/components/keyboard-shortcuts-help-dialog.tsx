"use client";

import { useEffect, useId, useState } from "react";

export interface KeyboardShortcutsHelpDialogProps {
  open: boolean;
  onClose: () => void;
}

type ShortcutItem = {
  keys: string;
  description: string;
};

type ShortcutSection = {
  title: string;
  hint?: string;
  items: ShortcutItem[];
};

function useModifierLabel(): string {
  const [label, setLabel] = useState("Strg");

  useEffect(() => {
    const platform =
      typeof navigator !== "undefined"
        ? navigator.platform || navigator.userAgent
        : "";
    if (/Mac|iPhone|iPod|iPad/i.test(platform)) {
      setLabel("Cmd");
    }
  }, []);

  return label;
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-[1.5rem] items-center justify-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-700 shadow-sm">
      {children}
    </kbd>
  );
}

function ShortcutKeys({ keys }: { keys: string }) {
  const parts = keys.split(" + ").map((part) => part.trim());
  return (
    <span className="flex flex-wrap items-center justify-end gap-1">
      {parts.map((part, index) => (
        <span key={`${part}-${index}`} className="inline-flex items-center gap-1">
          {index > 0 ? <span className="text-[10px] text-slate-400">+</span> : null}
          <Kbd>{part}</Kbd>
        </span>
      ))}
    </span>
  );
}

function ShortcutSectionBlock({ section }: { section: ShortcutSection }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{section.title}</h3>
      {section.hint ? <p className="mt-1 text-xs text-slate-500">{section.hint}</p> : null}
      <dl className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-100">
        {section.items.map((item) => (
          <div
            key={`${section.title}-${item.keys}-${item.description}`}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5"
          >
            <dt className="text-sm text-slate-700">{item.description}</dt>
            <dd className="m-0">
              <ShortcutKeys keys={item.keys} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function KeyboardShortcutsHelpDialog({ open, onClose }: KeyboardShortcutsHelpDialogProps) {
  const titleId = useId();
  const mod = useModifierLabel();

  if (!open) return null;

  const sections: ShortcutSection[] = [
    {
      title: "Karten (Drill-down)",
      hint: "Karte zuerst per Klick oder Pfeiltasten fokussieren (blauer Ring).",
      items: [
        { keys: "↑ ↓", description: "Zwischen Karten in der aktuellen Ebene wechseln" },
        { keys: "→", description: "In fokussierte Karte hinein (Drill-down)" },
        { keys: "← / Esc", description: "Eine Ebene höher" },
        { keys: "Leertaste", description: "In der Outline Zweig ein-/ausklappen" },
        { keys: "Enter", description: "Geschwisterkarte anlegen und Titel bearbeiten" },
        { keys: "Tab", description: "Unterkarte anlegen und Titel bearbeiten" },
        { keys: "F2", description: "Titel der fokussierten Karte bearbeiten" },
        { keys: `${mod} + K`, description: "Link aus Zwischenablage speichern" },
        { keys: "Entf / Rücktaste", description: "Karte löschen (mit Bestätigung)" },
      ],
    },
    {
      title: "Titel bearbeiten",
      items: [
        { keys: "Enter", description: "Titel übernehmen" },
        { keys: "Shift + Enter", description: "Titel übernehmen und Geschwisterkarte anlegen" },
        { keys: "Esc", description: "Bearbeitung abbrechen" },
      ],
    },
    {
      title: "Suche",
      items: [
        { keys: "↑ ↓", description: "Treffer auswählen" },
        { keys: "Enter", description: "Ausgewählte Karte öffnen" },
        { keys: "Esc", description: "Suchliste schließen" },
      ],
    },
    {
      title: "Maus",
      items: [
        { keys: "Klick", description: "Karte auswählen" },
        { keys: "Doppelklick", description: "Hinein (mit Kindern) oder Details" },
        { keys: "Ziehen", description: "Umsortieren oder auf andere Karte nesten" },
        { keys: "Rechtsklick", description: "Aktionen" },
      ],
    },
  ];

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
        className="flex max-h-[min(90vh,40rem)] w-full max-w-lg flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <div className="shrink-0 border-b border-slate-100 px-5 py-4">
          <h2 id={titleId} className="text-sm font-semibold text-slate-900">
            Kurzanleitung
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Die wichtigsten Tastaturkürzel für schnelles Arbeiten mit Karten.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {sections.map((section) => (
            <ShortcutSectionBlock key={section.title} section={section} />
          ))}
        </div>

        <div className="shrink-0 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
