import { lazyLabels, t } from "./i18n";
// Types shared between api and web. Kept as plain string unions (not Prisma
// enums) so the web app doesn't depend on @prisma/client.

export type UserRole = "ADMIN" | "MEMBER";
export type ProjectStatus = "ACTIVE" | "ON_HOLD" | "DONE" | "ARCHIVED";
export type CardPriority = "LOW" | "MEDIUM" | "HIGH";
// Task type: configured per workspace (settings → task types); every
// workspace has at least one, marked as default.
export interface TaskTypeRefDto {
  id: string;
  name: string;
  color: string | null;
}

export interface TaskTypeDto extends TaskTypeRefDto {
  position: number;
  isDefault: boolean;
  cardCount: number;
}

export type Locale = "ru" | "en";
export const LOCALES: readonly Locale[] = ["ru", "en"];
export const DEFAULT_LOCALE: Locale = "ru";

// Card key prefix (TSK → TSK-12). Configured per workspace in settings; the
// web app calls setCardKeyPrefix() once settings are loaded.
let cardKeyPrefix = "TSK";

export function setCardKeyPrefix(prefix: string) {
  cardKeyPrefix = prefix || "TSK";
}

export function cardKey(card: { number: number }) {
  return `${cardKeyPrefix}-${card.number}`;
}

export interface SettingsDto {
  workspaceName: string;
  cardPrefix: string;
  defaultColumns: string[];
}

export const PERMISSIONS = [
  { key: "projects.create", get label() { return t("shared.createProjects"); } },
  { key: "projects.edit", get label() { return t("shared.editProjects"); }, get hint() { return t("shared.nameDatesStatusBoardStages"); } },
  { key: "projects.delete", get label() { return t("shared.deleteProjects"); } },
  { key: "cards.delete", get label() { return t("shared.deleteCards"); } },
  { key: "templates.manage", get label() { return t("shared.createAndEditTemplates"); } },
  { key: "labels.manage", get label() { return t("shared.editAndDeleteLabels"); }, get hint() { return t("shared.anyEmployeeCanCreateAnd"); } },
  { key: "fields.manage", get label() { return t("shared.configureCustomCardFields"); } },
  { key: "types.manage", get label() { return t("shared.configureTaskTypes"); } },
  { key: "audit.view", get label() { return t("shared.viewTheActivityLog"); } },
  { key: "billing.manage", get label() { return t("shared.manageThePlanAndBilling"); } },
  { key: "time.viewAll", get label() { return t("shared.seeTheTimeOfAll"); }, get hint() { return t("shared.withoutThisPermissionTheReport"); } },
] as const;
export type Permission = (typeof PERMISSIONS)[number]["key"];

// Custom role. "Администратор" (UserRole ADMIN) is built in and may do everything.
export interface RoleDto {
  id: string;
  name: string;
  permissions: Permission[];
  isDefault: boolean;
  _count: { users: number };
}

export function can(user: { role: UserRole; permissions?: string[] } | null | undefined, perm: Permission) {
  if (!user) return false;
  return user.role === "ADMIN" || !!user.permissions?.includes(perm);
}


export const CARD_PRIORITY_LABELS: Record<CardPriority, string> = lazyLabels({
  HIGH: "shared.high",
  MEDIUM: "shared.medium",
  LOW: "shared.low",
});

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = lazyLabels({
  ACTIVE: "common.active",
  ON_HOLD: "common.onHold",
  DONE: "shared.completed",
  ARCHIVED: "shared.archived",
});

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  // Custom role for MEMBER; null for administrators.
  roleId: string | null;
  roleName: string;
  permissions: Permission[];
  isActive: boolean;
  avatarUrl?: string | null;
  emailNotifications?: boolean;
  locale?: Locale;
}

export interface UserRefDto {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export interface ClientDto {
  id: string;
  name: string;
  website: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  notes: string | null;
}

export interface ProjectListItemDto {
  id: string;
  title: string;
  status: ProjectStatus;
  startDate: string | null;
  deadline: string | null;
  hoursBudget: number | null;
  _count: { cards: number };
  // Cards not yet in the last ("done") column.
  openCards?: number;
}

// Label colours are stored as keys; the web app maps them to design tokens.
export const LABEL_COLORS = ["gray", "red", "orange", "amber", "green", "teal", "blue", "violet", "pink"] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

export interface LabelDto {
  id: string;
  name: string;
  color: LabelColor;
}

export interface CardTileDto {
  id: string;
  number: number;
  columnId: string;
  title: string;
  description: string | null;
  type: TaskTypeRefDto;
  priority: CardPriority;
  position: number;
  startDate: string | null;
  dueDate: string | null;
  estimateHours: number | null;
  updatedAt: string;
  assignees: { user: UserRefDto }[];
  labels: { label: LabelDto }[];
  project: { id: string; title: string };
  checklist: { id: string; text: string; done: boolean }[];
  _count: { comments: number; attachments?: number };
  recurringRuleId?: string | null;
  // Messages by others since the current user last opened the card.
  unreadComments?: number;
}

export interface ColumnDto {
  id: string;
  title: string;
  position: number;
  wipLimit: number | null;
  cards: CardTileDto[];
}

export interface BoardDto {
  id: string;
  projectId: string;
  columns: ColumnDto[];
}

export interface TeamBoardColumnDto {
  title: string;
  cards: CardTileDto[];
}

export interface TemplateListItemDto {
  id: string;
  name: string;
  columns: string[];
  _count: { cards: number };
}

export interface ChecklistItemDto {
  id: string;
  text: string;
  done: boolean;
  position: number;
}

export interface AttachmentDto {
  id: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
  commentId: string | null;
  uploaderId: string;
  // Signed, time-limited path (prefix with the API origin).
  url: string;
  uploader?: UserRefDto;
}

export interface CommentDto {
  id: string;
  text: string;
  createdAt: string;
  author: UserRefDto;
  attachments?: AttachmentDto[];
}

export interface TimeEntryDto {
  id: string;
  minutes: number;
  date: string;
  note: string | null;
  user: UserRefDto;
}

export interface ActivityDto {
  id: string;
  action: string;
  payload: unknown;
  createdAt: string;
  user: UserRefDto;
}

export type RecurrenceFrequency = "DAILY" | "WEEKLY" | "MONTHLY";

export interface RecurringRuleDto {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  typeId: string;
  priority: CardPriority;
  estimateHours: number | null;
  assigneeIds: string[];
  checklist: string[];
  frequency: RecurrenceFrequency;
  interval: number;
  weekday: number | null;
  monthDay: number | null;
  dueInDays: number | null;
  nextRunAt: string;
  lastRunAt: string | null;
  active: boolean;
}

export const CUSTOM_FIELD_TYPES = ["TEXT", "NUMBER", "DATE", "SELECT", "CHECKBOX"] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = lazyLabels({
  TEXT: "shared.text",
  NUMBER: "shared.number",
  DATE: "common.date",
  SELECT: "common.list",
  CHECKBOX: "shared.checkbox",
});

export interface CustomFieldDto {
  id: string;
  name: string;
  type: CustomFieldType;
  options: string[];
  position: number;
}

export type CustomFieldValue = string | number | boolean;

export interface CardDetailDto extends Omit<CardTileDto, "checklist"> {
  fieldValues: { fieldId: string; value: CustomFieldValue }[];
  attachments: AttachmentDto[];
  recurringRule?: { id: string; frequency: RecurrenceFrequency; interval: number; active: boolean } | null;
  column: { id: string; title: string };
  checklist: ChecklistItemDto[];
  comments: CommentDto[];
  timeEntries: TimeEntryDto[];
  activity: ActivityDto[];
}

// Field names in ActivityLog "updated" payloads → human labels.
export const CARD_FIELD_LABELS: Record<string, string> = lazyLabels({
  title: "shared.title",
  description: "shared.description",
  typeId: "shared.type",
  priority: "shared.priority",
  startDate: "shared.start",
  dueDate: "shared.dueDate",
  estimateHours: "shared.estimate",
  assigneeIds: "shared.assignees",
  labelIds: "shared.labels",
});

export type NotificationType = "ASSIGNED" | "MENTIONED" | "COMMENTED" | "DUE_SOON" | "OVERDUE";

export interface NotificationDto {
  id: string;
  type: NotificationType;
  text: string | null;
  readAt: string | null;
  createdAt: string;
  // Null for system reminders.
  actor: UserRefDto | null;
  card: { id: string; number: number; title: string; projectId: string };
}

// ---- Billing ----

export type PlanId = "FREE" | "PRO" | "BUSINESS";
export type PlanFeature = "time" | "roles" | "audit" | "export" | "api" | "gantt" | "fields";
export type BillingInterval = "MONTH" | "YEAR";
export type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "LOCKED";
export type PaymentStatus = "PENDING" | "PAID" | "FAILED";

// A year costs 10 months.
export const YEAR_MONTHS_CHARGED = 10;

export interface PlanDto {
  id: PlanId;
  name: string;
  position: number;
  // Kopecks per user per month.
  priceKopecks: number;
  maxUsers: number | null;
  maxProjects: number | null;
  maxRecurring: number | null;
  storageMbBase: number;
  storageMbPerSeat: number;
  features: PlanFeature[];
}

export interface BillingUsage {
  users: number;
  projects: number;
  recurring: number;
  storageMb: number;
}

export interface PaymentDto {
  id: string;
  kind: "INITIAL" | "RENEWAL";
  planId: PlanId;
  interval: BillingInterval;
  seats: number;
  amount: number;
  status: PaymentStatus;
  createdAt: string;
  paidAt: string | null;
}

export interface BillingDto {
  // Plan that applies right now (FREE after an expired trial).
  plan: PlanDto;
  plans: PlanDto[];
  // Read-only: the trial or paid period ended unpaid.
  locked: boolean;
  subscription: {
    planId: PlanId;
    status: SubscriptionStatus;
    interval: BillingInterval;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    cardMask: string | null;
  };
  usage: BillingUsage;
  // Storage allowed on the current plan, MB (null = unlimited).
  storageLimitMb: number | null;
  payments: PaymentDto[];
  // True when payments go to the built-in test provider instead of T-Bank.
  testMode: boolean;
}

// Amount in kopecks for `seats` users on a plan.
export function planAmount(plan: Pick<PlanDto, "priceKopecks">, seats: number, interval: BillingInterval) {
  return plan.priceKopecks * seats * (interval === "YEAR" ? YEAR_MONTHS_CHARGED : 1);
}

export function formatRub(kopecks: number) {
  return `${(kopecks / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;
}

export * from "./i18n";
