import type { RecurrenceFrequency } from "@prisma/client";

// Cards are created at 06:00 UTC (09:00 Moscow) on the run day.
const RUN_HOUR_UTC = 6;

export function atRunTime(day: string | Date) {
  const d = typeof day === "string" ? new Date(`${day}T00:00:00Z`) : new Date(day);
  d.setUTCHours(RUN_HOUR_UTC, 0, 0, 0);
  return d;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

// The run after `prev`, keeping the rule's weekday / day of month.
export function nextRun(
  rule: { frequency: RecurrenceFrequency; interval: number; monthDay: number | null },
  prev: Date,
): Date {
  const next = new Date(prev);
  const n = Math.max(1, rule.interval);
  if (rule.frequency === "DAILY") next.setUTCDate(next.getUTCDate() + n);
  else if (rule.frequency === "WEEKLY") next.setUTCDate(next.getUTCDate() + 7 * n);
  else {
    const day = rule.monthDay ?? prev.getUTCDate();
    const y = next.getUTCFullYear();
    const m = next.getUTCMonth() + n;
    const target = new Date(Date.UTC(y, m, 1, RUN_HOUR_UTC));
    target.setUTCDate(Math.min(day, daysInMonth(target.getUTCFullYear(), target.getUTCMonth())));
    return target;
  }
  return next;
}

// First run on or after `start` that matches the weekday / day of month.
export function firstRun(
  rule: { frequency: RecurrenceFrequency; weekday: number | null; monthDay: number | null },
  start: string,
): Date {
  const d = atRunTime(start);
  if (rule.frequency === "WEEKLY" && rule.weekday) {
    const current = ((d.getUTCDay() + 6) % 7) + 1; // 1 = Monday
    d.setUTCDate(d.getUTCDate() + ((rule.weekday - current + 7) % 7));
  }
  if (rule.frequency === "MONTHLY" && rule.monthDay) {
    const fit = (y: number, m: number) => Math.min(rule.monthDay!, daysInMonth(y, m));
    if (d.getUTCDate() > fit(d.getUTCFullYear(), d.getUTCMonth())) d.setUTCMonth(d.getUTCMonth() + 1, 1);
    d.setUTCDate(fit(d.getUTCFullYear(), d.getUTCMonth()));
  }
  return d;
}
