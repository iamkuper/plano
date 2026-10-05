import { lazyLabels, t } from "./i18n";
// Types shared between api and web. Kept as plain string unions (not Prisma
// enums) so the web app doesn't depend on @prisma/client.

export type UserRole = "ADMIN" | "MEMBER";
// AGENT: an AI teammate. It takes a seat like a person but never signs in.
export type UserKind = "HUMAN" | "AGENT";
export type ProjectStatus = "ACTIVE" | "ON_HOLD" | "DONE" | "ARCHIVED";
export type CardPriority = "LOW" | "MEDIUM" | "HIGH";
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
  id?: string;
  // Public numeric account ID: quoted in invoices and when contacting support.
  accountNumber?: number;
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
  { key: "agents.manage", get label() { return t("shared.manageAiAgents"); }, get hint() { return t("shared.manageAiAgentsHint"); } },
  { key: "webhooks.manage", get label() { return t("shared.manageWebhooks"); }, get hint() { return t("shared.manageWebhooksHint"); } },
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
  kind?: UserKind;
  // Active but beyond the paid seats: can't sign in (staff list only).
  overSeat?: boolean;
}

export interface UserRefDto {
  id: string;
  name: string;
  avatarUrl?: string | null;
  // AGENT shows a robot instead of initials.
  kind?: UserKind;
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
  // Chosen colour; null = automatic by position (stageColor).
  color: LabelColor | null;
  cards: CardTileDto[];
}

export interface BoardDto {
  id: string;
  projectId: string;
  columns: ColumnDto[];
}

export interface TeamBoardColumnDto {
  title: string;
  color: LabelColor | null;
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
export type PlanFeature = "time" | "roles" | "audit" | "export" | "api" | "gantt" | "fields" | "agents";
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
  // Pending invitations; each reserves a seat.
  invitations: number;
  projects: number;
  recurring: number;
  storageMb: number;
}

export interface PaymentDto {
  id: string;
  kind: "INITIAL" | "RENEWAL" | "SEATS";
  method: "CARD" | "INVOICE";
  invoiceNumber: number | null;
  payerName: string | null;
  failReason: string | null;
  planId: PlanId;
  interval: BillingInterval;
  seats: number;
  amount: number;
  status: PaymentStatus;
  createdAt: string;
  paidAt: string | null;
}

export interface InvoicePayer {
  payerName: string;
  payerInn: string;
  payerKpp: string | null;
  payerAddress: string;
  payerEmail: string;
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
    // Paid seats; null on FREE and during a trial.
    seats: number | null;
  };
  // Active users allowed right now; null = unlimited (trial, unlimited plan).
  seatLimit: number | null;
  usage: BillingUsage;
  // Storage allowed on the current plan, MB (null = unlimited).
  storageLimitMb: number | null;
  payments: PaymentDto[];
  // Details from the last invoice request, to prefill the next one.
  lastPayer: InvoicePayer | null;
  // The seller's details are set, so invoices come as PDF.
  invoicePdf: boolean;
  // True when payments go to the built-in test provider instead of T-Bank.
  testMode: boolean;
}

// Amount in kopecks for `seats` users on a plan.
export function planAmount(plan: Pick<PlanDto, "priceKopecks">, seats: number, interval: BillingInterval) {
  return plan.priceKopecks * seats * (interval === "YEAR" ? YEAR_MONTHS_CHARGED : 1);
}

// Days a prorated purchase is charged for: whole days left in the period,
// at least one.
export function daysLeft(periodEnd: Date | string, now = new Date()) {
  return Math.max(1, Math.ceil((new Date(periodEnd).getTime() - now.getTime()) / 86_400_000));
}

// Extra seats bought mid-period: the plan's monthly price per seat (a year
// is 10 months spread over 12) / 30 per day, for the days left. Kopecks.
export function prorateSeats(plan: Pick<PlanDto, "priceKopecks">, interval: BillingInterval, extraSeats: number, periodEnd: Date | string, now = new Date()) {
  const monthly = interval === "YEAR" ? (plan.priceKopecks * YEAR_MONTHS_CHARGED) / 12 : plan.priceKopecks;
  return Math.max(100, Math.round((monthly / 30) * daysLeft(periodEnd, now) * extraSeats));
}

export function formatRub(kopecks: number) {
  return `${(kopecks / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;
}

export * from "./i18n";

// ---- AI agents ----

export type AgentProvider = "ANTHROPIC" | "OPENAI" | "GOOGLE" | "OPENAI_COMPATIBLE";

// Providers an agent can call with the customer's own key. Models are
// suggestions only: any model id the provider accepts can be typed in.
export const AGENT_PROVIDERS: readonly { id: AgentProvider; name: string; models: string[]; needsBaseUrl: boolean }[] = [
  { id: "ANTHROPIC", name: "Anthropic (Claude)", models: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-4-5-20251001"], needsBaseUrl: false },
  { id: "OPENAI", name: "OpenAI", models: ["gpt-4o", "gpt-4o-mini"], needsBaseUrl: false },
  { id: "GOOGLE", name: "Google Gemini", models: ["gemini-2.0-flash", "gemini-1.5-pro"], needsBaseUrl: false },
  { id: "OPENAI_COMPATIBLE", name: "OpenAI-compatible (OpenRouter, DeepSeek, own server…)", models: [], needsBaseUrl: true },
];

export type AgentRunStatus = "RUNNING" | "DONE" | "FAILED" | "SKIPPED";

export interface AgentRunDto {
  id: string;
  status: AgentRunStatus;
  trigger: NotificationType;
  error: string | null;
  steps: number;
  inputTokens: number;
  outputTokens: number;
  createdAt: string;
  card: { id: string; number: number; title: string; projectId: string };
}

export interface AgentDto {
  id: string;
  name: string;
  avatarUrl: string | null;
  roleId: string | null;
  roleName: string;
  // Deactivated agents free their seat.
  isActive: boolean;
  provider: AgentProvider;
  model: string;
  baseUrl: string | null;
  // Last characters of the stored key; the key itself is never returned.
  keyHint: string;
  instructions: string;
  enabled: boolean;
  // Active but beyond the paid seats: does not react until a seat is added.
  overSeat: boolean;
  lastRun: AgentRunDto | null;
  // Spent so far: today and over the last 30 days (skipped runs cost nothing).
  usage: { today: AgentUsage; month: AgentUsage };
}

export interface AgentUsage {
  runs: number;
  inputTokens: number;
  outputTokens: number;
}

// ---- public API: tokens and webhooks ----

export interface ApiTokenDto {
  id: string;
  name: string;
  // Last characters of the token.
  hint: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export const WEBHOOK_EVENTS = ["card.created", "card.updated", "card.moved", "card.deleted", "comment.created"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export interface WebhookDto {
  id: string;
  url: string;
  // Empty = every event.
  events: WebhookEvent[];
  isActive: boolean;
  createdAt: string;
  // Result of the latest attempt, null before the first one.
  lastDelivery: { ok: boolean; statusCode: number | null; createdAt: string } | null;
}

export interface WebhookDeliveryDto {
  id: string;
  event: string;
  ok: boolean;
  statusCode: number | null;
  error: string | null;
  attempts: number;
  createdAt: string;
}
