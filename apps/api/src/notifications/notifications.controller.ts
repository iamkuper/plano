import { Body, Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import { IsArray, IsOptional, IsString } from "class-validator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedUser, CurrentUser } from "../auth/current-user.decorator";
import { NotificationsService } from "./notifications.service";

class MarkReadDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];
}

@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.list(user.userId);
  }

  // No ids → mark everything read.
  @Post("read")
  @HttpCode(204)
  read(@CurrentUser() user: AuthenticatedUser, @Body() dto: MarkReadDto) {
    return this.notifications.markRead(user.userId, dto.ids);
  }
}
