import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { LABEL_COLORS, t } from "@plano/shared";
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from "class-validator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionGuard, RequirePermission } from "../auth/guards/permission.guard";
import { AuthenticatedUser, CurrentUser } from "../auth/current-user.decorator";
import { BoardsService } from "./boards.service";

class CreateColumnDto {
  @IsString()
  @MinLength(1)
  title!: string;
}

class UpdateColumnDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  wipLimit?: number | null;

  @IsOptional()
  @IsNumber()
  position?: number;

  // null resets to the automatic colour.
  @IsOptional()
  @IsIn([...LABEL_COLORS], { message: () => t("common.unknownColour") })
  color?: string | null;
}

@Controller()
@UseGuards(JwtAuthGuard, PermissionGuard)
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Get("projects/:projectId/board")
  getByProject(@Param("projectId") projectId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.boards.getByProject(projectId, user.userId);
  }

  @Get("team-board")
  team(@CurrentUser() user: AuthenticatedUser, @Query("assigneeId") assigneeId?: string) {
    return this.boards.team(user.userId, assigneeId);
  }

  @Post("boards/:boardId/columns")
  @RequirePermission("projects.edit")
  addColumn(@Param("boardId") boardId: string, @Body() dto: CreateColumnDto) {
    return this.boards.addColumn(boardId, dto.title);
  }

  @Delete("columns/:id")
  @RequirePermission("projects.edit")
  @HttpCode(204)
  removeColumn(@Param("id") id: string) {
    return this.boards.removeColumn(id);
  }

  @Patch("columns/:id")
  @RequirePermission("projects.edit")
  updateColumn(@Param("id") id: string, @Body() dto: UpdateColumnDto) {
    return this.boards.updateColumn(id, dto);
  }
}
