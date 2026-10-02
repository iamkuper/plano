// Due-date reminders against a running API (DB shared). Run from apps/api:
//   pnpm exec ts-node --transpile-only test/reminders.ts
import { PrismaClient } from "@prisma/client";
import { DueRemindersService } from "../src/notifications/due-reminders.service";

const API = process.env.API_URL ?? "http://localhost:3101";
const db = new PrismaClient();
const run = Date.now().toString(36);
let failed = 0;

async function call(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(API + path, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
function check(name: string, ok: boolean, extra = "") {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` ${extra}`}`);
}

async function main() {
  const email = `rem-${run}@iso.test`;
  const reg = await fetch(`${API}/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceName: "Напоминания", name: "Н", email, password: "password-123" }) });
  const t = ((await reg.json()) as { accessToken: string }).accessToken;
  const me = (await call(t, "GET", "/users/me")).body;
  const tpl = (await call(t, "GET", "/templates")).body[0];
  const proj = (await call(t, "POST", "/projects", { title: "Сроки", templateId: tpl.id })).body;
  const board = (await call(t, "GET", `/projects/${proj.id}/board`)).body;
  const cards = board.columns[0].cards as { id: string }[];
  const last = board.columns[board.columns.length - 1].id;

  const midnightUtc = (offsetDays: number) => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offsetDays)).toISOString();
  };
  const setup = async (i: number, offset: number | null) => {
    await call(t, "PATCH", `/cards/${cards[i].id}`, { assigneeIds: [me.id], ...(offset === null ? {} : { dueDate: midnightUtc(offset) }) });
  };
  await setup(0, 0); // today
  await setup(1, 1); // tomorrow
  await setup(2, -1); // yesterday -> overdue
  await setup(3, 5); // far
  await setup(4, 0); // today, but done
  await call(t, "POST", `/cards/${cards[4].id}/move`, { columnId: last });
  await setup(5, -10); // long overdue: not reminded

  let sent = 0;
  const realtime = { notify: () => {} } as any;
  const mailer = { send: async (rows: unknown[]) => { sent += rows.length; } } as any;
  const svc = new DueRemindersService(db as any, realtime, mailer);
  const n1 = await svc.run();

  const list = (await call(t, "GET", "/notifications")).body.items as { type: string; actor: unknown; card: { id: string } }[];
  const by = (id: string) => list.filter((n) => n.card.id === id).map((n) => n.type);
  check("due today -> DUE_SOON", by(cards[0].id).join() === "DUE_SOON");
  check("due tomorrow -> DUE_SOON", by(cards[1].id).join() === "DUE_SOON");
  check("due yesterday -> OVERDUE", by(cards[2].id).join() === "OVERDUE");
  check("due in 5 days -> nothing", by(cards[3].id).length === 0);
  check("done card -> nothing", by(cards[4].id).length === 0);
  check("long overdue card -> nothing", by(cards[5].id).length === 0);
  check("system reminders have no actor", list.every((n) => n.actor === null));
  check("3 reminders created and handed to the mailer", n1 === 3 && sent === 3, `${n1}/${sent}`);

  const n2 = await svc.run();
  check("second run creates nothing", n2 === 0 && (await call(t, "GET", "/notifications")).body.items.length === 3);

  // A new due date on the same card earns a new reminder.
  await call(t, "PATCH", `/cards/${cards[0].id}`, { dueDate: midnightUtc(1) });
  check("rescheduled card is reminded again", (await svc.run()) === 1);

  // Opt-out is stored and respected by the mailer query.
  const off = await call(t, "PATCH", "/users/me", { emailNotifications: false });
  check("profile stores the e-mail preference", off.body.emailNotifications === false);

  console.log(failed ? `\n${failed} check(s) failed` : "\nAll reminder checks passed");
}

main().catch((e) => { console.error(e); failed++; }).finally(async () => { await db.$disconnect(); process.exit(failed ? 1 : 0); });
