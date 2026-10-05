import type { TaskTypeDto, TaskTypeRefDto, BillingDto, CardDetailDto, CardTileDto, ColumnDto, PlanDto, UserDto } from "@plano/shared";
import type { OnboardingDto } from "@/lib/api";

export const taskType = (over: Partial<TaskTypeRefDto> = {}): TaskTypeRefDto => ({ id: "tt1", name: "Задача", color: null, ...over });
export const taskTypes = (): TaskTypeDto[] => [
  { ...taskType(), position: 0, isDefault: true, cardCount: 3 },
  { id: "tt2", name: "Ошибка", color: "red", position: 1, isDefault: false, cardCount: 1 },
];

export const user = (over: Partial<UserDto> = {}): UserDto => ({
  id: "u1", email: "ivan@example.ru", name: "Иван Петров", role: "ADMIN", roleId: null, roleName: "Администратор",
  permissions: [], isActive: true, avatarUrl: null, emailNotifications: true, ...over,
});

export const member = (over: Partial<UserDto> = {}) => user({ id: "u2", email: "anna@example.ru", name: "Анна Смирнова", role: "MEMBER", roleName: "Участник", ...over });

export const card = (over: Partial<CardTileDto> = {}): CardTileDto => ({
  id: "c1", number: 1, columnId: "col1", title: "Первая карточка", description: null, type: taskType(), priority: "MEDIUM",
  position: 1, startDate: null, dueDate: null, estimateHours: null, updatedAt: "2026-10-01T10:00:00.000Z",
  assignees: [], labels: [], project: { id: "p1", title: "Проект" }, checklist: [], _count: { comments: 0, attachments: 0 }, ...over,
});

export const cardDetail = (over: Partial<CardDetailDto> = {}): CardDetailDto => ({
  ...card(), attachments: [], column: { id: "col1", title: "Бэклог" }, checklist: [], comments: [], timeEntries: [], activity: [], fieldValues: [], ...over,
} as CardDetailDto);

export const column = (over: Partial<ColumnDto> = {}): ColumnDto => ({ id: "col1", title: "Бэклог", position: 1, wipLimit: null, cards: [], ...over });

export const plans: PlanDto[] = [
  { id: "FREE", name: "Free", position: 1, priceKopecks: 0, maxUsers: 3, maxProjects: 3, maxRecurring: 3, storageMbBase: 1024, storageMbPerSeat: 0, features: [] },
  { id: "PRO", name: "Pro", position: 2, priceKopecks: 49000, maxUsers: null, maxProjects: null, maxRecurring: null, storageMbBase: 0, storageMbPerSeat: 20480, features: ["time", "roles"] },
  { id: "BUSINESS", name: "Business", position: 3, priceKopecks: 99000, maxUsers: null, maxProjects: null, maxRecurring: null, storageMbBase: 0, storageMbPerSeat: 102400, features: ["time", "roles", "audit", "export", "gantt", "fields"] },
];

export const billing = (over: Partial<BillingDto> = {}): BillingDto => ({
  plan: plans[1], plans, locked: false,
  subscription: { planId: "PRO", status: "TRIALING", interval: "MONTH", trialEndsAt: "2026-10-16T00:00:00.000Z", currentPeriodEnd: null, cancelAtPeriodEnd: false, cardMask: null, seats: null },
  seatLimit: null, usage: { users: 2, invitations: 0, projects: 1, recurring: 0, storageMb: 5 }, storageLimitMb: 40960, payments: [], lastPayer: null, invoicePdf: false, testMode: true, ...over,
});

export const onboarding = (over: Partial<OnboardingDto> = {}): OnboardingDto => ({
  kind: "owner", welcomeSeen: true, closed: false, completed: 1,
  steps: [
    { id: "project", title: "Создайте первый проект", description: "Проект — это одна работа.", done: true, action: { label: "Создать проект", href: "/projects?new=1" } },
    { id: "card", title: "Добавьте карточку", description: "Карточка — одна задача.", done: false, action: { label: "Открыть доску", href: "/projects/p1" } },
  ],
  ...over,
});
