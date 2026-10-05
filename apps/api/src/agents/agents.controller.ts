import { Body, Controller, Delete, Get, HttpCode, Module, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from "class-validator";
import { AGENT_PROVIDERS, t, type AgentProvider } from "@plano/shared";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionGuard, RequirePermission } from "../auth/guards/permission.guard";
import { AgentsService } from "./agents.service";
import { AgentRunner } from "./agent-runner.service";
import { CardsModule } from "../cards/cards.module";

const PROVIDER_IDS = AGENT_PROVIDERS.map((p) => p.id);

class AgentDto {
  @IsString()
  @MinLength(1, { message: () => t("api.agents.enterAName") })
  @MaxLength(40, { message: () => t("common.nameMustBeUpTo") })
  name!: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  roleId?: string | null;

  @IsIn(PROVIDER_IDS, { message: () => t("api.agents.unknownProvider") })
  provider!: AgentProvider;

  @IsString()
  @MinLength(1, { message: () => t("api.agents.enterAModel") })
  @MaxLength(100)
  model!: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(300)
  baseUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000, { message: () => t("api.agents.instructionsTooLong") })
  instructions?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

class UpdateAgentDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: () => t("api.agents.enterAName") })
  @MaxLength(40, { message: () => t("common.nameMustBeUpTo") })
  name?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  roleId?: string | null;

  @IsOptional()
  @IsIn(PROVIDER_IDS, { message: () => t("api.agents.unknownProvider") })
  provider?: AgentProvider;

  @IsOptional()
  @IsString()
  @MinLength(1, { message: () => t("api.agents.enterAModel") })
  @MaxLength(100)
  model?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(300)
  baseUrl?: string | null;

  // Left out = keep the stored key.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000, { message: () => t("api.agents.instructionsTooLong") })
  instructions?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class TestAgentDto {
  @IsOptional()
  @IsString()
  agentId?: string;

  @IsIn(PROVIDER_IDS, { message: () => t("api.agents.unknownProvider") })
  provider!: AgentProvider;

  @IsString()
  @MinLength(1, { message: () => t("api.agents.enterAModel") })
  model!: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  baseUrl?: string | null;

  @IsOptional()
  @IsString()
  apiKey?: string;
}

// AI agents are teammates with their own model and the customer's key.
// Everything here needs "agents.manage".
@Controller("agents")
@UseGuards(JwtAuthGuard, PermissionGuard)
@RequirePermission("agents.manage")
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get()
  list() {
    return this.agents.list();
  }

  @Post()
  create(@Body() dto: AgentDto) {
    return this.agents.create(dto);
  }

  @Post("test")
  @HttpCode(200)
  test(@Body() dto: TestAgentDto) {
    return this.agents.test(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateAgentDto) {
    return this.agents.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id") id: string) {
    return this.agents.remove(id);
  }

  @Get(":id/runs")
  runs(@Param("id") id: string) {
    return this.agents.runs(id);
  }
}

@Module({
  imports: [CardsModule],
  controllers: [AgentsController],
  providers: [AgentsService, AgentRunner],
  exports: [AgentRunner],
})
export class AgentsModule {}
