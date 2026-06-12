import Link from "next/link";

/** Fallback-Seite, wenn die App-Shell offline nicht aus dem Cache geladen werden kann. */
export default function OfflineFallbackPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center text-slate-800">
      <h1 className="text-xl font-semibold">T2 — offline</h1>
      <p className="max-w-md text-sm text-slate-600">
        Die Oberfläche ist noch nicht im Cache. Einmal online öffnen und die App installieren bzw. laden — danach
        funktioniert der Start auch ohne Netz.
      </p>
      <Link
        href="/"
        className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
      >
        Erneut versuchen
      </Link>
    </main>
  );
}
