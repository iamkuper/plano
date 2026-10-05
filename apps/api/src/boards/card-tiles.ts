import type { Card } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { countsOf, withCounts } from "./card-counts";

// Card tiles for boards and lists, assembled by hand. Asking Prisma for a card
// with nested `include`s (assignees → user, labels → label, project, checklist)
// is correct but costs more in Node than in the database: for 2000 cards the
// nesting took about 240 ms of CPU against 120 ms of SQL. Here every relation
// is read flat, with one query each, and joined in memory with small lookups.
// The result has the same shape as `cardTileInclude` + counts.
type Scope = { ids: string[] } | { projectId: string };

const CHUNK = 10_000; // keeps one IN list far below the driver's parameter limit

const cardWhere = (scope: Scope) => ("ids" in scope ? { cardId: { in: scope.ids } } : { card: { projectId: scope.projectId } });

async function inChunks<T>(ids: string[], run: (part: string[]) => Promise<T[]>): Promise<T[]> {
  if (ids.length <= CHUNK) return run(ids);
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await run(ids.slice(i, i + CHUNK))));
  return out;
}

export async function buildTiles(prisma: PrismaService, cards: Card[], scope: Scope) {
  if (!cards.length) return [];
  const scopes: Scope[] = "ids" in scope ? chunkScopes(scope.ids) : [scope];
  const flat = async <T>(run: (s: Scope) => Promise<T[]>) => (await Promise.all(scopes.map(run))).flat();

  const [assigneeRows, labelRows, checklistRows, counts] = await Promise.all([
    flat((s) => prisma.cardAssignee.findMany({ where: cardWhere(s), select: { cardId: true, userId: true } })),
    flat((s) => prisma.cardLabel.findMany({ where: cardWhere(s), select: { cardId: true, labelId: true } })),
    flat((s) => prisma.checklistItem.findMany({ where: cardWhere(s), select: { id: true, cardId: true, text: true, done: true }, orderBy: { position: "asc" } })),
    countsOf(prisma, scope),
  ]);
  const userIds = [...new Set(assigneeRows.map((a) => a.userId))];
  const labelIds = [...new Set(labelRows.map((l) => l.labelId))];
  const projectIds = [...new Set(cards.map((c) => c.projectId))];
  const [users, labels, projects] = await Promise.all([
    inChunks(userIds, (part) => prisma.user.findMany({ where: { id: { in: part } }, select: { id: true, name: true, avatarUrl: true, kind: true } })),
    inChunks(labelIds, (part) => prisma.label.findMany({ where: { id: { in: part } }, select: { id: true, name: true, color: true } })),
    inChunks(projectIds, (part) => prisma.project.findMany({ where: { id: { in: part } }, select: { id: true, title: true } })),
  ]);
  const userById = new Map(users.map((u) => [u.id, u]));
  const labelById = new Map(labels.map((l) => [l.id, l]));
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const group = <R extends { cardId: string }, V>(rows: R[], pick: (r: R) => V | undefined) => {
    const map = new Map<string, V[]>();
    for (const r of rows) {
      const v = pick(r);
      if (v === undefined) continue;
      const list = map.get(r.cardId);
      if (list) list.push(v);
      else map.set(r.cardId, [v]);
    }
    return map;
  };
  const assigneesOf = group(assigneeRows, (r) => (userById.has(r.userId) ? { user: userById.get(r.userId)! } : undefined));
  const labelsOf = group(labelRows, (r) => (labelById.has(r.labelId) ? { label: labelById.get(r.labelId)! } : undefined));
  const checklistOf = group(checklistRows, (r) => ({ id: r.id, text: r.text, done: r.done }));

  return cards.map((c) =>
    withCounts(
      { ...c, assignees: assigneesOf.get(c.id) ?? [], labels: labelsOf.get(c.id) ?? [], project: projectById.get(c.projectId)!, checklist: checklistOf.get(c.id) ?? [] },
      counts,
    ),
  );
}

function chunkScopes(ids: string[]): Scope[] {
  const parts: Scope[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) parts.push({ ids: ids.slice(i, i + CHUNK) });
  return parts.length ? parts : [{ ids: [] }];
}
