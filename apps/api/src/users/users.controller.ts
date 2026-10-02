import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AdminGuard } from "../auth/guards/admin.guard";
import { AuthenticatedUser, CurrentUser } from "../auth/current-user.decorator";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { ChangePasswordDto, ResetPasswordDto, SetAvatarDto, UpdateMeDto } from "./dto/profile.dto";

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.users.me(user.userId);
  }

  @Patch("me")
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateMeDto) {
    return this.users.updateMe(user.userId, dto);
  }

  @Post("me/password")
  @HttpCode(204)
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    return this.users.changePassword(user.userId, dto.currentPassword, dto.newPassword);
  }

  @Put("me/avatar")
  setAvatar(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetAvatarDto) {
    return this.users.setAvatar(user.userId, dto.avatarUrl ?? null);
  }

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Post(":id/password")
  @HttpCode(204)
  @UseGuards(AdminGuard)
  resetPassword(@Param("id") id: string, @Body() dto: ResetPasswordDto) {
    return this.users.resetPassword(id, dto.password);
  }

  @Patch(":id")
  @UseGuards(AdminGuard)
  update(@Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }
}
