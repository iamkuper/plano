import { Injectable } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { SystemPrismaService } from "./system-prisma.service";
import { scopedClient } from "./tenant";

// The client every feature service injects: same API as PrismaClient, but all
// queries are limited to the workspace of the current request (see tenant.ts).
// The constructor returns the extended client, so the instance is it.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface PrismaService extends PrismaClient {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
@Injectable()
export class PrismaService {
  constructor(system: SystemPrismaService) {
    return scopedClient(system) as unknown as PrismaService;
  }
}
