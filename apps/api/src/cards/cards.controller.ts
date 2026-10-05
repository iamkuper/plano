import { BadRequestException, Body, Controller, ForbiddenException, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionGuard, RequirePermission } from "../auth/guards/permission.guard";
import { AuthenticatedUser, CurrentUser } from "../auth/current-user.decorator";
import { can, t } from "@plano/shared";
import { CardsService } from "./cards.service";
import { CreateCardDto } from "./dto/create-card.dto";
import { UpdateCardDto } from "./dto/update-card.dto";
import { MoveCardDto } from "./dto/move-card.dto";
import { BulkCardsDto } from "./dto/bulk.dto";
import {
  CreateChecklistItemDto,
  CreateCommentDto,
  CreateTimeEntryDto,
  UpdateChecklistItemDto,
} from "./dto/card-parts.dto";

@Controller()
@UseGuards(JwtAuthGuard, PermissionGuard)
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  // Declared before cards/:id so "urgent-count" isn't captured as an id.
  @Get("cards/urgent-count")
  urgentCount(@CurrentUser() user: AuthenticatedUser, @Query("before") before?: string) {
    const date = before ? new Date(before) : new Date();
    if (Number.isNaN(date.getTime())) throw new BadRequestException(t("api.cards.invalidDate"));
    return this.cards.urgentCount(user.userId, date);
  }

  // Ids of the cards (optionally of one project) that contain the text.
  @Get("cards/match")
  match(@Query("q") q = "", @Query("projectId") projectId?: string) {
    return this.cards.matchIds(q, projectId || undefined);
  }

  // Declared before cards/:id so "search" isn't captured as an id.
  @Get("cards/search")
  search(@Query("q") q = "") {
    return this.cards.search(q);
  }

  // Declared before cards/:id routes.
  @Post("cards/bulk")
  bulk(@Body() dto: BulkCardsDto, @CurrentUser() user: AuthenticatedUser) {
    if (dto.action === "delete" && !can(user, "cards.delete")) {
      throw new ForbiddenException(t("api.cards.missingPermissionDeleteCardsAn"));
    }
    return this.cards.bulk(dto, user.userId);
  }

  @Get("cards/:id")
  get(@Param("id") id: string) {
    return this.cards.get(id);
  }

  @Post("cards")
  create(@Body() dto: CreateCardDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cards.create(dto, user.userId);
  }

  @Patch("cards/:id")
  update(@Param("id") id: string, @Body() dto: UpdateCardDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cards.update(id, dto, user.userId);
  }

  @Post("cards/:id/read")
  @HttpCode(204)
  markRead(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cards.markRead(id, user.userId);
  }

  @Post("cards/:id/move")
  move(@Param("id") id: string, @Body() dto: MoveCardDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cards.move(id, dto, user.userId);
  }

  @Delete("cards/:id")
  @RequirePermission("cards.delete")
  remove(@Param("id") id: string) {
    return this.cards.remove(id);
  }

  @Post("cards/:id/checklist")
  addChecklistItem(@Param("id") id: string, @Body() dto: CreateChecklistItemDto) {
    return this.cards.addChecklistItem(id, dto.text);
  }

  @Patch("checklist/:itemId")
  updateChecklistItem(@Param("itemId") itemId: string, @Body() dto: UpdateChecklistItemDto) {
    return this.cards.updateChecklistItem(itemId, dto);
  }

  @Delete("checklist/:itemId")
  removeChecklistItem(@Param("itemId") itemId: string) {
    return this.cards.removeChecklistItem(itemId);
  }

  @Post("cards/:id/comments")
  addComment(@Param("id") id: string, @Body() dto: CreateCommentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cards.addComment(id, user.userId, dto.text ?? "", dto.mentionIds, dto.attachmentIds);
  }

  @Delete("comments/:commentId")
  removeComment(@Param("commentId") commentId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cards.removeComment(commentId, user);
  }

  @Post("cards/:id/time")
  addTimeEntry(@Param("id") id: string, @Body() dto: CreateTimeEntryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.cards.addTimeEntry(id, user.userId, dto);
  }

  @Delete("time/:entryId")
  removeTimeEntry(@Param("entryId") entryId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cards.removeTimeEntry(entryId, user);
  }
}
