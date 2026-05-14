import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hierarchischer Task-Manager",
  description: "Spalten-basierte Mindmap-Tasks im Trello-Stil",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
