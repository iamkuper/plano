// Yandex Metrica goals for the funnel: signup → first project → payment.
// No-op without NEXT_PUBLIC_YM_ID (local development) or before the counter loads.
export const YM_ID = process.env.NEXT_PUBLIC_YM_ID ? Number(process.env.NEXT_PUBLIC_YM_ID) : null;

export type Goal = "signup" | "project_created" | "payment_started" | "invoice_requested" | "payment_success" | "pricing_cta";

export function goal(name: Goal, params?: Record<string, unknown>) {
  if (!YM_ID || typeof window === "undefined") return;
  try {
    (window as unknown as { ym?: (...args: unknown[]) => void }).ym?.(YM_ID, "reachGoal", name, params);
  } catch {
    // Analytics must never break the app.
  }
}
