import { randomUUID } from "crypto";
import * as bcrypt from "bcrypt";
import type { PrismaClient } from "@prisma/client";

// A deterministic pseudo-random generator: the same data on every run.
let state = 123456789;
export const rnd = () => ((state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296);
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)];

const WORDS = "платёж отчёт клиент интеграция сайт макет бриф звонок договор счёт склад доставка баг релиз тест правка сверка выгрузка письмо акт заказ".split(" ");
const sentence = (n: number) => Array.from({ length: n }, () => pick(WORDS)).join(" ");
const DAY = 86_400_000;

async function chunked<T>(rows: T[], insert: (part: T[]) => Promise<unknown>, size = 5000) {
  for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size));
}

export interface SeedSize {
  members: number;
  projects: number;
  /** extra cards in the biggest project */
  megaCards: number;
  bigProjects: number;
  bigProjectCards: number;
  regularCards: number;
  tenants: number;
}
export const FULL: SeedSize = { members: 59, projects: 150, megaCards: 3000, bigProjects: 10, bigProjectCards: 800, regularCards: 100, tenants: 30 };

export interface Tenant {
  workspaceId: string;
  adminId: string;
  userIds: string[];
  labelIds: string[];
  projects: { id: string; columns: string[]; cards: string[] }[];
}

// Fills a workspace that was created through /auth/register (so it has an
// admin, a subscription and the starter labels) with realistic bulk data.
export async function fillWorkspace(db: PrismaClient, workspaceId: string, adminId: string, size: SeedSize): Promise<Tenant> {
  const hash = await bcrypt.hash("password-123", 4);
  const memberRows = Array.from({ length: size.members }, (_, i) => ({ id: randomUUID(), workspaceId, email: `m${i}-${workspaceId}@bench.test`, passwordHash: hash, name: `Сотрудник ${i + 1}`, role: "MEMBER" as const }));
  await chunked(memberRows, (data) => db.user.createMany({ data }));
  const userIds = [adminId, ...memberRows.map((m) => m.id)];
  const labelIds = (await db.label.findMany({ where: { workspaceId }, select: { id: true } })).map((l) => l.id);

  const projects: Tenant["projects"] = [];
  const boards: { id: string; projectId: string }[] = [];
  const columns: { id: string; boardId: string; title: string; position: number }[] = [];
  const projectRows = Array.from({ length: size.projects }, (_, i) => {
    const id = randomUUID();
    const boardId = randomUUID();
    const cols = ["Бэклог", "В работе", "На проверке", "Готово"].map((title, p) => ({ id: randomUUID(), boardId, title, position: p + 1 }));
    boards.push({ id: boardId, projectId: id });
    columns.push(...cols);
    projects.push({ id, columns: cols.map((c) => c.id), cards: [] });
    return { id, workspaceId, title: `Проект ${i + 1}: ${sentence(2)}`, status: i < size.projects - Math.floor(size.projects / 5) ? ("ACTIVE" as const) : ("DONE" as const) };
  });
  await db.project.createMany({ data: projectRows });
  await db.board.createMany({ data: boards });
  await db.column.createMany({ data: columns });

  const now = Date.now();
  const cardRows: any[] = [];
  const assignees: any[] = [];
  const cardLabels: any[] = [];
  const checklist: any[] = [];
  const comments: any[] = [];
  const activity: any[] = [];
  const timeEntries: any[] = [];
  const reads: any[] = [];
  const notifications: any[] = [];
  let number = 0;
  projects.forEach((project, pi) => {
    const count = pi === 0 ? size.megaCards : pi <= size.bigProjects ? size.bigProjectCards : size.regularCards;
    for (let i = 0; i < count; i++) {
      const id = randomUUID();
      project.cards.push(id);
      number++;
      const col = rnd() < 0.4 ? 3 : int(0, 2);
      const created = now - int(1, 400) * DAY;
      cardRows.push({
        id, workspaceId, number, projectId: project.id, columnId: project.columns[col], title: `${sentence(int(2, 5))} #${number}`,
        description: rnd() < 0.75 ? sentence(int(5, 90)) : null, priority: pick(["LOW", "MEDIUM", "MEDIUM", "HIGH"] as const), position: i + 1,
        dueDate: rnd() < 0.6 ? new Date(now + int(-60, 60) * DAY) : null, startDate: rnd() < 0.3 ? new Date(now + int(-90, 0) * DAY) : null,
        estimateHours: rnd() < 0.5 ? int(1, 40) : null, createdAt: new Date(created),
      });
      // The first user (the admin) is on ~8% of the cards, member 1 on ~2%.
      if (rnd() < 0.08) assignees.push({ cardId: id, userId: userIds[0] });
      else if (rnd() < 0.025) assignees.push({ cardId: id, userId: userIds[1] });
      else if (rnd() < 0.6) assignees.push({ cardId: id, userId: pick(userIds.slice(2)) });
      if (rnd() < 0.4) for (const l of new Set([pick(labelIds), pick(labelIds)])) cardLabels.push({ cardId: id, labelId: l });
      if (rnd() < 0.35) for (let k = 0; k < int(1, 8); k++) checklist.push({ id: randomUUID(), cardId: id, text: sentence(3), done: rnd() < 0.5, position: k + 1 });
      if (rnd() < 0.3) for (let k = 0; k < int(1, 6); k++) comments.push({ id: randomUUID(), cardId: id, authorId: pick(userIds), text: sentence(int(4, 25)), createdAt: new Date(created + int(1, 60) * DAY) });
      for (let k = 0; k < 3; k++) activity.push({ id: randomUUID(), cardId: id, userId: pick(userIds), action: pick(["created", "moved", "updated"]), createdAt: new Date(created + k * DAY) });
      if (rnd() < 0.2) for (let k = 0; k < 2; k++) timeEntries.push({ id: randomUUID(), cardId: id, userId: pick(userIds), minutes: int(15, 480), date: new Date(now - int(0, 90) * DAY) });
      if (rnd() < 0.15) reads.push({ userId: userIds[0], cardId: id });
      if (rnd() < 0.05) notifications.push({ id: randomUUID(), userId: userIds[0], cardId: id, type: pick(["ASSIGNED", "COMMENTED", "MENTIONED"] as const), readAt: rnd() < 0.7 ? new Date() : null, createdAt: new Date(now - int(0, 60) * DAY) });
    }
  });
  await db.workspace.update({ where: { id: workspaceId }, data: { cardCounter: number } });
  await chunked(cardRows, (data) => db.card.createMany({ data }));
  await chunked(assignees, (data) => db.cardAssignee.createMany({ data, skipDuplicates: true }));
  await chunked(cardLabels, (data) => db.cardLabel.createMany({ data, skipDuplicates: true }));
  await chunked(checklist, (data) => db.checklistItem.createMany({ data }));
  await chunked(comments, (data) => db.comment.createMany({ data }));
  await chunked(activity, (data) => db.activityLog.createMany({ data }));
  await chunked(timeEntries, (data) => db.timeEntry.createMany({ data }));
  await chunked(reads, (data) => db.cardRead.createMany({ data, skipDuplicates: true }));
  await chunked(notifications, (data) => db.notification.createMany({ data, skipDuplicates: true }));
  await chunked(
    Array.from({ length: Math.round(number * 0.8) }, (_, i) => ({ id: randomUUID(), workspaceId, userId: pick(userIds), action: "card.update", summary: `Изменена карточка ${i}`, createdAt: new Date(now - int(0, 300) * DAY) })),
    (data) => db.auditLog.createMany({ data }),
  );
  return { workspaceId, adminId, userIds, labelIds, projects };
}
