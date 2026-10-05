import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// Public pages are indexed; the app itself (behind sign-in) is not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/projects", "/team", "/reports", "/settings", "/profile", "/platform", "/billing", "/invite", "/reset", "/forgot"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
