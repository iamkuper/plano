// Minimal iCalendar (RFC 5545) writer for all-day events.

const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// Lines are folded at 75 octets; continuation lines start with a space.
function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export const icsDate = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
const icsStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export interface IcsEvent {
  uid: string;
  summary: string;
  description?: string;
  url?: string;
  // First day and the day after the last one (all-day events end exclusively).
  start: Date;
  endExclusive: Date;
  modified: Date;
}

export function buildCalendar(name: string, events: IcsEvent[], now = new Date()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Plano//Tasks//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escape(name)}`, "REFRESH-INTERVAL;VALUE=DURATION:PT1H"];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${icsStamp(now)}`,
      `LAST-MODIFIED:${icsStamp(e.modified)}`,
      `DTSTART;VALUE=DATE:${icsDate(e.start)}`,
      `DTEND;VALUE=DATE:${icsDate(e.endExclusive)}`,
      `SUMMARY:${escape(e.summary)}`,
      ...(e.description ? [`DESCRIPTION:${escape(e.description)}`] : []),
      ...(e.url ? [`URL:${e.url}`] : []),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
