import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

// Unscoped client. Only for code that has no workspace yet or works across
// workspaces: login/registration, the JWT strategy, the websocket handshake,
// the recurring-task scheduler and signed file links. Everything else uses
// PrismaService, which is restricted to the current workspace.
@Injectable()
export class SystemPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
