import type { RecurrenceFrequency } from "@amo-kanban/shared";

export const WEEKDAYS = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];
const WEEKDAYS_ACC = ["понедельникам", "вторникам", "средам", "четвергам", "пятницам", "субботам", "воскресеньям"];

function every(n: number, one: string, few: string, many: string) {
  if (n === 1) return one;
  const m10 = n % 10;
  const m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  return `${n} ${word}`;
}

// "Каждый день", "Каждые 2 недели, по понедельникам", "Каждый месяц, 5-го числа".
export function describeRecurrence(r: { frequency: RecurrenceFrequency; interval: number; weekday?: number | null; monthDay?: number | null }) {
  const n = Math.max(1, r.interval);
  if (r.frequency === "DAILY") return n === 1 ? "Каждый день" : `Каждые ${every(n, "день", "дня", "дней")}`;
  if (r.frequency === "WEEKLY") {
    const base = n === 1 ? "Каждую неделю" : `Каждые ${every(n, "неделю", "недели", "недель")}`;
    return r.weekday ? `${base}, по ${WEEKDAYS_ACC[r.weekday - 1]}` : base;
  }
  const base = n === 1 ? "Каждый месяц" : `Каждые ${every(n, "месяц", "месяца", "месяцев")}`;
  return r.monthDay ? `${base}, ${r.monthDay}-го числа` : base;
}
