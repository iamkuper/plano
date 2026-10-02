import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionGuard, RequirePermission } from "../auth/guards/permission.guard";
import { AuthenticatedUser, CurrentUser } from "../auth/current-user.decorator";
import { SaveRecurringDto, ToggleRecurringDto } from "./recurring.dto";
import { RecurringService } from "./recurring.service";

@Controller()
@UseGuards(JwtAuthGuard, PermissionGuard)
export class RecurringController {
  constructor(private readonly recurring: RecurringService) {}

  @Get("projects/:projectId/recurring")
  list(@Param("projectId") projectId: string) {
    return this.recurring.list(projectId);
  }

  @Post("projects/:projectId/recurring")
  @RequirePermission("projects.edit")
  create(@Param("projectId") projectId: string, @Body() dto: SaveRecurringDto, @CurrentUser() user: AuthenticatedUser) {
    return this.recurring.create(projectId, dto, user.userId);
  }

  @Put("recurring/:id")
  @RequirePermission("projects.edit")
  update(@Param("id") id: string, @Body() dto: SaveRecurringDto) {
    return this.recurring.update(id, dto);
  }

  @Patch("recurring/:id")
  @RequirePermission("projects.edit")
  toggle(@Param("id") id: string, @Body() dto: ToggleRecurringDto) {
    return this.recurring.setActive(id, dto.active);
  }

  @Post("recurring/:id/run")
  run(@Param("id") id: string) {
    return this.recurring.runNow(id);
  }

  @Delete("recurring/:id")
  @RequirePermission("projects.edit")
  @HttpCode(204)
  remove(@Param("id") id: string) {
    return this.recurring.remove(id);
  }
}
