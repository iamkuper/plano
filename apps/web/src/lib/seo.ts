import type { PlanDto } from "@plano/shared";
import { API_URL } from "./api";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://plano.team").replace(/\/$/, "");
export const SITE_NAME = "Plano";
export const SITE_DESCRIPTION =
  "Plano — канбан и таск-трекер для небольших команд и агентств: доски, сроки, обсуждения, учёт времени и диаграмма Ганта. 14 дней бесплатно, оплата картой или по счёту.";

// Plans for server-rendered pricing (search engines see the prices).
// Refreshed every 10 minutes; null when the API is unreachable.
export async function fetchPlans(): Promise<{ plans: PlanDto[]; trialDays: number } | null> {
  try {
    const res = await fetch(`${API_URL}/billing/plans`, { next: { revalidate: 600 } });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// <script type="application/ld+json"> payload.
export function jsonLd(data: unknown) {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}
