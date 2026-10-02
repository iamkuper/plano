import type { Metadata, Viewport } from "next";
import { Golos_Text } from "next/font/google";
import { CookieBanner } from "@/components/cookie-banner";
import { Metrika } from "@/components/metrika";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";
import "./globals.css";

// Golos Text: a Cyrillic-first UI typeface — crisp at 12–14px.
const golos = Golos_Text({ variable: "--font-main", subsets: ["latin", "cyrillic"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Plano — канбан для команд и агентств", template: "%s — Plano" },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  icons: { icon: "/plano.svg" },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "Plano — канбан и таск-трекер для команд и агентств",
    description: SITE_DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: "Plano — канбан для команд и агентств", description: SITE_DESCRIPTION },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { themeColor: "#2B2F33" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${golos.variable} h-full antialiased`}>
      <body className="min-h-full bg-bg font-sans text-base text-ink">
        {children}
        <Metrika />
        <CookieBanner />
      </body>
    </html>
  );
}
