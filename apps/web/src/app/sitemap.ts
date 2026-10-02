import type { MetadataRoute } from "next";
import { LEGAL_PAGES } from "@/lib/company";
import { SITE_URL } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/pricing`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/register`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/login`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    ...LEGAL_PAGES.map((p) => ({ url: `${SITE_URL}${p.href}`, lastModified: now, changeFrequency: "yearly" as const, priority: 0.2 })),
  ];
}
