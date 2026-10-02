import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { PrismaService } from "../prisma/prisma.service";
import { SystemPrismaService } from "../prisma/system-prisma.service";
import { runInWorkspace } from "../prisma/tenant";

// Rooms: user:<id> (personal: notifications), project:<id> (board), card:<id>
// (card window). Events carry ids only; clients refetch what they show.
const ROOM_RE = /^(project|card):[a-z0-9]+$/;

@WebSocketGateway({ cors: { origin: true } })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly log = new Logger(RealtimeGateway.name);
  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
  ) {}

  // Auth runs async; "join" messages can arrive before it finishes, so they
  // wait on this promise instead of being dropped.
  handleConnection(client: Socket) {
    client.data.ready = this.authenticate(client);
  }

  private async authenticate(client: Socket): Promise<boolean> {
    try {
      const token = (client.handshake.auth as { token?: string })?.token;
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token ?? "");
      const user = await this.system.user.findUnique({ where: { id: payload.sub } });
      if (!user?.isActive) throw new Error("inactive");
      client.data.userId = user.id;
      client.data.workspaceId = user.workspaceId;
      await client.join(`user:${user.id}`);
      return true;
    } catch {
      client.disconnect(true);
      return false;
    }
  }

  @SubscribeMessage("join")
  async join(@ConnectedSocket() client: Socket, @MessageBody() room: string) {
    if (!(await client.data.ready)) return;
    if (typeof room !== "string" || !ROOM_RE.test(room)) return;
    // Only rooms of the user's own workspace.
    const [kind, id] = room.split(":");
    // `await` inside the callback: a Prisma query only starts when awaited, and
    // it must start inside the workspace context.
    const exists = await runInWorkspace(client.data.workspaceId, async () =>
      kind === "project" ? await this.prisma.project.count({ where: { id } }) : await this.prisma.card.count({ where: { id } }),
    );
    if (exists) await client.join(room);
  }

  @SubscribeMessage("leave")
  leave(@ConnectedSocket() client: Socket, @MessageBody() room: string) {
    if (typeof room === "string") client.leave(room);
  }

  emit(room: string, event: string, data: Record<string, unknown> = {}) {
    try {
      this.server?.to(room).emit(event, data);
    } catch (e) {
      this.log.warn(`emit ${event} to ${room} failed: ${(e as Error).message}`);
    }
  }
}
