// A workspace is locked (read-only, payment still possible) when its trial
// ran out unpaid or a paid period ended and was not renewed. The scheduler
// stores LOCKED, but the state is also derived from the dates, so a lapsed
// workspace is locked even if the scheduler hasn't run yet.
export const GRACE_AFTER_PERIOD_MS = 3 * 86_400_000;

interface SubscriptionLike {
  planId: string;
  status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "LOCKED";
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}

export function isLocked(sub: SubscriptionLike | null | undefined, now = new Date()): boolean {
  if (!sub) return false;
  if (sub.status === "LOCKED") return true;
  if (sub.status === "TRIALING") return !sub.trialEndsAt || sub.trialEndsAt <= now;
  if (sub.planId !== "FREE" && sub.currentPeriodEnd) return sub.currentPeriodEnd.getTime() + GRACE_AFTER_PERIOD_MS < now.getTime();
  return false;
}

// Requests that stay allowed while locked: reading, paying, signing in and
// small personal things (profile, marking notifications read).
export function allowedWhileLocked(method: string, path: string): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return true;
  const p = path.split("?")[0];
  return (
    p.startsWith("/billing") ||
    p.startsWith("/auth/") ||
    p.startsWith("/platform") ||
    p === "/users/me" ||
    p.startsWith("/users/me/") ||
    p === "/notifications/read" ||
    /^\/cards\/[^/]+\/read$/.test(p) ||
    p.startsWith("/onboarding")
  );
}
