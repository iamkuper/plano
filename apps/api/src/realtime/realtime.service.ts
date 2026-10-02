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

  boardChanged(projectId: string) {
    this.gateway.emit(`project:${projectId}`, "board:changed", { projectId });
  }

  // Card content changed: refresh its window and the board it sits on.
  async cardChanged(cardId: string, projectId?: string) {
    const pid = projectId ?? (await this.prisma.card.findUnique({ where: { id: cardId }, select: { projectId: true } }))?.projectId;
    this.gateway.emit(`card:${cardId}`, "card:changed", { cardId });
    if (pid) this.boardChanged(pid);
  }

  notify(userId: string) {
    this.gateway.emit(`user:${userId}`, "notifications:changed");
  }
}
