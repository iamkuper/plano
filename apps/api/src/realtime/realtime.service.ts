import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeGateway } from "./realtime.gateway";

// What services call after a write. Kept tiny on purpose: "something on this
// board/card changed" — the client decides what to refetch.
@Injectable()
export class RealtimeService {
  constructor(
    private readonly gateway: RealtimeGateway,
    private readonly prisma: PrismaService,
  ) {}

  // `hint` says which card changed, so the browser can refetch that one tile
  // instead of the whole board. Without it the board is reloaded.
  boardChanged(projectId: string, hint?: { cardId: string; op: "upsert" | "remove" }) {
    this.gateway.emit(`project:${projectId}`, "board:changed", { projectId, ...hint });
  }

  // Card content changed: refresh its window and the board it sits on.
  async cardChanged(cardId: string, projectId?: string, op: "upsert" | "remove" = "upsert") {
    const pid = projectId ?? (await this.prisma.card.findUnique({ where: { id: cardId }, select: { projectId: true } }))?.projectId;
    this.gateway.emit(`card:${cardId}`, "card:changed", { cardId });
    if (pid) this.boardChanged(pid, { cardId, op });
  }

  notify(userId: string) {
    this.gateway.emit(`user:${userId}`, "notifications:changed");
  }
}
