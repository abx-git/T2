"use client";

import { useEffect, useState, type FormEvent } from "react";

export interface ServerLoginDialogProps {
  open: boolean;
  defaultUsername?: string;
  onClose: () => void;
  onLogin: (username: string, password: string) => Promise<void>;
}

export function ServerLoginDialog({
  open,
  defaultUsername = "admin",
  onClose,
  onLogin,
}: ServerLoginDialogProps) {
  const [username, setUsername] = useState(defaultUsername);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setUsername(defaultUsername);
    setPassword("");
    setError(null);
    setBusy(false);
  }, [open, defaultUsername]);

  if (!open) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onLogin(username.trim(), password);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={(e) => void submit(e)}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-slate-900">Server-Board anmelden</h2>
        <p className="mt-1 text-xs text-slate-600">
          Zum Laden und Speichern der Board-Datei auf dem Server sind Zugangsdaten nötig.
        </p>

        <label className="mt-4 block text-xs font-medium text-slate-700">
          Benutzername
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm"
            disabled={busy}
          />
        </label>

        <label className="mt-3 block text-xs font-medium text-slate-700">
          Passwort
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm"
            disabled={busy}
            required
          />
        </label>

        {error ? <p className="mt-3 text-xs text-red-700">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-60"
          >
            {busy ? "Anmelden …" : "Anmelden"}
          </button>
        </div>
      </form>
    </div>
  );
}
