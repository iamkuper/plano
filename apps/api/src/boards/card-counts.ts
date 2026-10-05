import type { PrismaService } from "../prisma/prisma.service";

// Comment and attachment counts for card tiles. Asked as `_count` in a card
// query, Prisma counts over the whole table and joins the result back, which
// gets slower with every comment of every workspace; a grouped count limited
// to the cards at hand (or to one project) uses the cardId indexes instead.
type Scope = { ids: string[] } | { projectId: string };

async function grouped(prisma: PrismaService, model: "comment" | "attachment", scope: Scope) {
  const where = "ids" in scope ? { cardId: { in: scope.ids } } : { card: { projectId: scope.projectId } };
  const rows = await (prisma[model] as unknown as { groupBy(a: unknown): Promise<{ cardId: string; _count: { _all: number } }[]> }).groupBy({ by: ["cardId"], where, _count: { _all: true } });
  return new Map(rows.map((r) => [r.cardId, r._count._all]));
}

export async function countsOf(prisma: PrismaService, scope: Scope) {
  if ("ids" in scope && !scope.ids.length) return { comments: new Map<string, number>(), attachments: new Map<string, number>() };
  const [comments, attachments] = await Promise.all([grouped(prisma, "comment", scope), grouped(prisma, "attachment", scope)]);
  return { comments, attachments };
}

type Counts = Awaited<ReturnType<typeof countsOf>>;
export const withCounts = <T extends { id: string }>(card: T, counts: Counts) => ({ ...card, _count: { comments: counts.comments.get(card.id) ?? 0, attachments: counts.attachments.get(card.id) ?? 0 } });

// For code that holds a list of cards and has no counts yet.
export async function attachCounts<T extends { id: string }>(prisma: PrismaService, cards: T[]) {
  const counts = await countsOf(prisma, { ids: cards.map((c) => c.id) });
  return cards.map((c) => withCounts(c, counts));
}
