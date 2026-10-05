import type { Metadata } from "next";
import { Golos_Text } from "next/font/google";
import "./globals.css";
import { LocaleGate } from "@/components/locale-gate";
// Golos Text: a Cyrillic-first UI typeface — crisp at 12–14px.
const golos = Golos_Text({ variable: "--font-main", subsets: ["latin", "cyrillic"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Plano",
  icons: { icon: "/plano.svg" },
  description: "Kanban boards for teams",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${golos.variable} h-full antialiased`}>
      <body className="min-h-full bg-bg font-sans text-base text-ink"><LocaleGate>{children}</LocaleGate></body>
    </html>
  );
}
