import { Controller, ForbiddenException, Get, HttpCode, Module, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedUser, CurrentUser } from "../auth/current-user.decorator";
import { ProjectsModule } from "../projects/projects.module";
import { OnboardingService } from "./onboarding.service";
import { t } from "@plano/shared";
@Controller("onboarding")
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.onboarding.get(user.userId, user.role === "ADMIN");
  }

  @Post("welcome-seen")
  @HttpCode(204)
  welcomeSeen(@CurrentUser() user: AuthenticatedUser) {
    return this.onboarding.markWelcomeSeen(user.userId);
  }

  @Post("close")
  @HttpCode(204)
  close(@CurrentUser() user: AuthenticatedUser) {
    return this.onboarding.close(user.userId);
  }

  @Post("reopen")
  @HttpCode(204)
  reopen(@CurrentUser() user: AuthenticatedUser) {
    return this.onboarding.reopen(user.userId);
  }

  // Needs the right to create projects, like creating one by hand.
  @Post("sample-project")
  sample(@CurrentUser() user: AuthenticatedUser) {
    if (user.role !== "ADMIN" && !user.permissions.includes("projects.create")) throw new ForbiddenException(t("api.onboarding.noPermissionToCreateProjects"));
    return this.onboarding.createSample();
  }
}

@Module({ imports: [ProjectsModule], controllers: [OnboardingController], providers: [OnboardingService] })
export class OnboardingModule {}
