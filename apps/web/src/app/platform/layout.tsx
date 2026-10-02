import type { Metadata } from "next";

// The hidden back-office: not linked anywhere, kept out of search engines.
export const metadata: Metadata = { title: "Plano", robots: { index: false, follow: false } };

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return children;
}
