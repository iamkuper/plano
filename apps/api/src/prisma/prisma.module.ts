import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { SystemPrismaService } from "./system-prisma.service";
import { TenantInterceptor } from "./tenant.interceptor";
import { APP_INTERCEPTOR } from "@nestjs/core";

@Global()
@Module({
  providers: [SystemPrismaService, PrismaService, { provide: APP_INTERCEPTOR, useClass: TenantInterceptor }],
  exports: [PrismaService, SystemPrismaService],
})
export class PrismaModule {}
