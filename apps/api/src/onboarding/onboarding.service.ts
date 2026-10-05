import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SystemPrismaService } from "../prisma/system-prisma.service";
import { ProjectsService } from "../projects/projects.service";
import { defaultTemplateNames } from "../templates/default-template";

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  done: boolean;
  // Where the button takes the person.
  action: { label: string; href: string };
}

const DAY = 86_400_000;

// First-run guidance. Progress is read from real data (a project exists, a
// card has an assignee...), so steps complete by themselves when the person
// does the thing, wherever they do it. Only "welcome seen" and "closed" are
// stored, per user.
@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
    private readonly projects: ProjectsService,
  ) {}

  async get(userId: string, isAdmin: boolean) {
    const me = await this.prisma.user.findFirstOrThrow({ where: { id: userId }, select: { welcomeSeenAt: true, onboardingClosedAt: true } });
    const steps = isAdmin ? await this.ownerSteps(userId) : await this.memberSteps(userId);
    return {
      kind: isAdmin ? ("owner" as const) : ("member" as const),
      welcomeSeen: !!me.welcomeSeenAt,
      closed: !!me.onboardingClosedAt,
      steps,
      completed: steps.filter((s) => s.done).length,
    };
  }

  private async ownerSteps(userId: string): Promise<OnboardingStep[]> {
    const [project, cards, assigned, invites, users, comments] = await Promise.all([
      this.prisma.project.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }),
      this.prisma.card.count(),
      this.prisma.card.count({ where: { dueDate: { not: null }, assignees: { some: {} } } }),
      this.prisma.invitation.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.comment.count({ where: { authorId: userId } }),
    ]);
    const board = project ? `/projects/${project.id}` : "/projects";
    return [
      { id: "project", title: "Создайте первый проект", description: "Проект — это одна работа со своей доской. Можно взять готовый шаблон или создать пример.", done: !!project, action: { label: "Создать проект", href: "/projects?new=1" } },
      { id: "card", title: "Добавьте карточку", description: "Карточка — одна задача. Нажмите «+» в колонке доски и введите название.", done: cards > 0, action: { label: "Открыть доску", href: board } },
      { id: "assign", title: "Назначьте исполнителя и срок", description: "Откройте карточку и выберите исполнителя и срок: они появятся в календаре и напоминаниях.", done: assigned > 0, action: { label: "Открыть доску", href: board } },
      { id: "invite", title: "Пригласите коллегу", description: "Человек получит ссылку и сам задаст пароль. Роль можно выбрать сразу.", done: invites > 0 || users > 1, action: { label: "Пригласить", href: "/settings/users?invite=1" } },
      { id: "message", title: "Напишите сообщение в карточке", description: "Обсуждение задачи живёт в карточке. Через @ можно упомянуть коллегу.", done: comments > 0, action: { label: "Открыть доску", href: board } },
    ];
  }

  private async memberSteps(userId: string): Promise<OnboardingStep[]> {
    const [opened, comments] = await Promise.all([this.prisma.cardRead.count({ where: { userId } }), this.prisma.comment.count({ where: { authorId: userId } })]);
    return [
      { id: "open", title: "Откройте свою задачу", description: "На вкладке «Задачи» видны карточки всей команды. Нажмите на любую, чтобы открыть.", done: opened > 0, action: { label: "К задачам", href: "/team" } },
      { id: "message", title: "Напишите сообщение", description: "Вопросы и договорённости по задаче пишите в карточке: их увидит вся команда.", done: comments > 0, action: { label: "К задачам", href: "/team" } },
    ];
  }

  async markWelcomeSeen(userId: string) {
    await this.prisma.user.updateMany({ where: { id: userId, welcomeSeenAt: null }, data: { welcomeSeenAt: new Date() } });
  }

  async close(userId: string) {
    await this.prisma.user.updateMany({ where: { id: userId }, data: { onboardingClosedAt: new Date(), welcomeSeenAt: new Date() } });
  }

  async reopen(userId: string) {
    await this.prisma.user.updateMany({ where: { id: userId }, data: { onboardingClosedAt: null } });
  }

  // A ready project from the starter template with dates spread over the
  // next weeks, so the board, calendar and reminders have something to show.
  async createSample() {
    const template = await this.prisma.template.findFirst({ where: { name: { in: defaultTemplateNames() } } });
    const now = Date.now();
    const project = await this.projects.create({
      title: "Знакомство с Plano",
      templateId: template?.id,
      startDate: new Date(now),
      deadline: new Date(now + 30 * DAY),
    } as never);
    const cards = await this.prisma.card.findMany({ where: { projectId: project.id }, orderBy: { position: "asc" }, select: { id: true } });
    let day = 0;
    for (const [i, c] of cards.entries()) {
      const length = 2 + (i % 3) * 2;
      await this.prisma.card.update({
        where: { id: c.id },
        data: { startDate: new Date(now + day * DAY), dueDate: new Date(now + (day + length) * DAY) },
      });
      day += length + 1;
    }
    return { id: project.id };
  }
}
