import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { IsEmail, IsEnum, IsOptional, IsString } from "class-validator";
import { UserRole } from "@prisma/client";
import { AdminGuard } from "../auth/guards/admin.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedUser, CurrentUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { InvitationsService } from "./invitations.service";

class InviteDto {
  @IsEmail({}, { message: "Укажите почту" })
  email!: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsString()
  roleId?: string;
}

@Controller("invitations")
@UseGuards(JwtAuthGuard, AdminGuard)
export class InvitationsController {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  list() {
    return this.invitations.list();
  }

  @Post()
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: InviteDto) {
    const me = await this.prisma.user.findFirstOrThrow({ where: { id: user.userId }, select: { name: true } });
    return this.invitations.create(dto, { userId: user.userId, name: me.name });
  }

  @Delete(":id")
  @HttpCode(204)
  revoke(@Param("id") id: string) {
    return this.invitations.revoke(id);
  }
}
