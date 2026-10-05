import { t, type RecurrenceFrequency } from "@plano/shared";

// Weekday names, Monday first (the recurrence form's options).
export const weekdayNames = () => [1, 2, 3, 4, 5, 6, 7].map((d) => t(`weekday.${d}`));

// "Every day", "Every 2 weeks, on Mondays", "Every month, on day 5".
export function describeRecurrence(r: { frequency: RecurrenceFrequency; interval: number; weekday?: number | null; monthDay?: number | null }) {
  const n = Math.max(1, r.interval);
  if (r.frequency === "DAILY") return n === 1 ? t("recurrence.everyDay") : t("recurrence.everyNDays", { count: n });
  if (r.frequency === "WEEKLY") {
    const base = n === 1 ? t("recurrence.everyWeek") : t("recurrence.everyNWeeks", { count: n });
    return r.weekday ? t("recurrence.onWeekday", { base, weekday: t(`weekdayOn.${r.weekday}`) }) : base;
  }
  const base = n === 1 ? t("recurrence.everyMonth") : t("recurrence.everyNMonths", { count: n });
  return r.monthDay ? t("recurrence.onMonthDay", { base, monthDay: r.monthDay }) : base;
}
