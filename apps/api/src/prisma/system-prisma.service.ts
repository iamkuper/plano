import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { AUTH_MODELS, clearAuthCache } from "../auth/auth-cache";

const READ_ACTIONS = new Set(["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy", "queryRaw", "findRaw", "aggregateRaw"]);

// Unscoped client. Only for code that has no workspace yet or works across
// workspaces: login/registration, the JWT strategy, the websocket handshake,
// the recurring-task scheduler and signed file links. Everything else uses
// PrismaService, which is restricted to the current workspace.
@Injectable()
export class SystemPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // PRISMA_QUERY_LOG=1: emit query events (used by the benchmark in bench/).
    super(process.env.PRISMA_QUERY_LOG === "1" ? { log: [{ emit: "event", level: "query" }] } : undefined);
    // Every write (also those made through the scoped client, which runs on
    // this one) to what the auth check reads drops its cache.
    this.$use(async (params, next) => {
      const result = await next(params);
      if (params.model && AUTH_MODELS.has(params.model) && !READ_ACTIONS.has(params.action)) clearAuthCache();
      return result;
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
