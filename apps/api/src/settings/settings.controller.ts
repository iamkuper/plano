import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../auth/guards/admin.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { UpdateSettingsDto } from "./settings.dto";
import { SettingsService } from "./settings.service";

@Controller("settings")
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  get() {
    return this.settings.get();
  }

  @Patch()
  @UseGuards(JwtAuthGuard, AdminGuard)
  update(@Body() dto: UpdateSettingsDto) {
    return this.settings.update(dto);
  }
}
