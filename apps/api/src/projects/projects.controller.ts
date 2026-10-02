import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ProjectStatus } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionGuard, RequirePermission } from "../auth/guards/permission.guard";
import { ProjectsService } from "./projects.service";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";

@Controller("projects")
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@Query("status") status?: ProjectStatus) {
    return this.projects.list(status);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.projects.get(id);
  }

  @Get(":id/stats")
  stats(@Param("id") id: string) {
    return this.projects.stats(id);
  }

  @Post()
  @RequirePermission("projects.create")
  create(@Body() dto: CreateProjectDto) {
    return this.projects.create(dto);
  }

  @Patch(":id")
  @RequirePermission("projects.edit")
  update(@Param("id") id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(id, dto);
  }

  @Delete(":id")
  @RequirePermission("projects.delete")
  @HttpCode(204)
  remove(@Param("id") id: string) {
    return this.projects.remove(id);
  }
}
