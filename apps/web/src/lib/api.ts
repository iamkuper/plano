import type {
  ApiTokenDto,
  WebhookDeliveryDto,
  WebhookDto,
  WebhookEvent,
  BillingDto,
  BillingInterval,
  BoardDto,
  CardDetailDto,
  CardTileDto,
  CardPriority,
  AgentDto,
  AgentProvider,
  AgentRunDto,
  ChecklistItemDto,
  ColumnDto,
  CustomFieldDto,
  CustomFieldType,
  CustomFieldValue,
  LabelColor,
  LabelDto,
  CommentDto,
  NotificationDto,
  RecurrenceFrequency,
  RecurringRuleDto,
  AttachmentDto,
  ProjectListItemDto,
  RoleDto,
  SettingsDto,
  TeamBoardColumnDto,
  TeamStageCountDto,
  TimeEntriesPageDto,
  TimeSummaryDto,
  TemplateListItemDto,
  TimeEntryDto,
  UserDto,
  UserRole,
  InvoicePayer,
} from "@plano/shared";
import { currentLocale, t, type Locale } from "@plano/shared";
export interface InvitationDto {
  id: string;
  email: string;
  role: UserRole;
  roleId: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface OnboardingStepDto {
  id: string;
  title: string;
  description: string;
  done: boolean;
  action: { label: string; href: string };
}

export interface OnboardingDto {
  kind: "owner" | "member";
  welcomeSeen: boolean;
  closed: boolean;
  steps: OnboardingStepDto[];
  completed: number;
}

export type PlatformState = "trial" | "paid" | "free" | "locked" | "past_due";

export interface PlatformStats {
  workspaces: number;
  users: number;
  newWorkspaces7d: number;
  newWorkspaces30d: number;
  states: Record<PlatformState, number>;
  mrrKopecks: number;
  paid30dKopecks: number;
  paidCount30d: number;
  failedPayments7d: number;
}

export interface PlatformWorkspaceRow {
  id: string;
  accountNumber: number;
  name: string;
  createdAt: string;
  owner: { email: string; name: string } | null;
  users: number;
  projects: number;
  cards: number;
  planId: string;
  state: PlatformState;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  lastPayment: { paidAt: string | null; amount: number } | null;
}

export interface PlatformWorkspaceDetail {
  id: string;
  accountNumber: number;
  name: string;
  createdAt: string;
  state: PlatformState;
  storageBytes: number;
  subscription: { planId: string; status: string; interval: string; trialEndsAt: string | null; currentPeriodEnd: string | null; cardMask: string | null; cancelAtPeriodEnd: boolean; seats: number | null } | null;
  users: { id: string; name: string; email: string; role: string; isActive: boolean; createdAt: string }[];
  payments: { id: string; kind: string; method: string; invoiceNumber: number | null; planId: string; seats: number; amount: number; status: string; createdAt: string; paidAt: string | null }[];
  _count: { projects: number; cards: number };
}

export interface AuditEntryDto {
  id: string;
  action: string;
  summary: string;
  entityId: string | null;
  createdAt: string;
  user: { id: string; name: string; avatarUrl?: string | null } | null;
}

// Downloads an invoice PDF (own workspace, or any for the platform owner).
export async function downloadInvoicePdf(id: string, number: number, platform = false) {
  const token = getToken();
  const res = await fetch(`${API_URL}${platform ? "/platform/invoices" : "/billing/invoice"}/${id}/pdf`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? t("lib.api.couldNotDownloadTheInvoice", { status: res.status }));
  }
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `Plano-schet-${number}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Downloads a project's cards as CSV (Business).
export async function downloadProjectCsv(projectId: string, fallbackName: string) {
  const token = getToken();
  const res = await fetch(`${API_URL}/projects/${projectId}/export.csv`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? t("lib.api.couldNotExport", { status: res.status }));
  }
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fallbackName}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// The time report as a file for Excel: built by the server from all entries of the period.
export async function downloadTimeCsv(from: string, to: string, userId?: string) {
  const token = getToken();
  const res = await fetch(`${API_URL}/reports/time/export.csv?from=${from}&to=${to}${userId ? `&userId=${userId}` : ""}`, { headers: { "X-Locale": currentLocale(), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? t("lib.api.couldNotExport", { status: res.status }));
  }
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `uchet-vremeni_${from}_${to}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type BulkAction = "move" | "assign" | "unassign" | "priority" | "due" | "delete";

export interface RecurringInput {
  title: string;
  description?: string | null;
  priority?: CardPriority;
  estimateHours?: number | null;
  assigneeIds?: string[];
  checklist?: string[];
  frequency: RecurrenceFrequency;
  interval: number;
  weekday?: number | null;
  monthDay?: number | null;
  dueInDays?: number | null;
  startDate: string;
}

// Absolute URL for a signed attachment path from the API.
export const fileUrl = (path: string) => `${API_URL}${path}`;

// Multipart upload with progress (fetch has no upload progress).
export function uploadAttachment(cardId: string, file: File, onProgress?: (pct: number) => void) {
  return new Promise<AttachmentDto>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/cards/${cardId}/attachments`);
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body: { message?: string | string[] } & Partial<AttachmentDto> = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as AttachmentDto);
      else if (xhr.status === 413) reject(new Error(t("lib.api.isLargerThan20Mb", { name: file.name })));
      else reject(new Error((Array.isArray(body.message) ? body.message.join(", ") : body.message) ?? t("lib.api.couldNotUpload", { name: file.name })));
    };
    xhr.onerror = () => reject(new Error(t("lib.api.noConnectionToTheServer")));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}


export interface AgentInput {
  name: string;
  roleId?: string | null;
  provider: AgentProvider;
  model: string;
  baseUrl?: string | null;
  apiKey?: string;
  instructions?: string;
  enabled?: boolean;
}

export interface TemplateCardInput {
  title: string;
  description?: string | null;
  estimateHours?: number | null;
  checklist: string[];
}
export interface TemplateInput {
  name: string;
  columns: string[];
  cards: TemplateCardInput[];
}
export type TemplateDetailDto = TemplateInput & { id: string; cards: (TemplateCardInput & { id: string; position: number })[] };

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3101";
export interface PlatformInvoice {
  id: string;
  invoiceNumber: number;
  planId: string;
  interval: BillingInterval;
  seats: number;
  amount: number;
  createdAt: string;
  payerName: string;
  payerInn: string;
  payerKpp: string | null;
  payerAddress: string;
  payerEmail: string;
  workspace: { id: string; name: string; accountNumber: number };
}

export const BILLING_CHANGED = "plano:billing-changed";
const TOKEN_KEY = "plano.token";

export function getToken() {
  return typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY);
}

// Modules that cache per-account data (the profile, workspace settings,
// labels...) register a reset here, so signing in as someone else never shows
// the previous account's data.
const sessionResets: (() => void)[] = [];
export const onSessionChange = (reset: () => void) => void sessionResets.push(reset);

// ---- response cache ----
// Slow-changing reads (the profile, people, labels, projects, plan...) are
// remembered for a short time and shared between components that ask at once,
// so moving between pages doesn't refetch them. Every write that could change
// them empties the cache (cards and comments only touch the project counters).
const cache = new Map<string, { at: number; value: Promise<unknown> }>();

function cachedGet<T>(path: string, ms: number): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < ms) return hit.value.then((v) => clone(v) as T);
  const value = apiFetch<T>(path);
  cache.set(path, { at: Date.now(), value });
  // A failure must not stay in the cache.
  value.catch(() => cache.get(path)?.value === value && cache.delete(path));
  return value.then((v) => clone(v) as T);
}
// Callers get their own copy: nobody can change what the next one reads.
const clone = (v: unknown) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

if (typeof window !== "undefined") window.addEventListener(BILLING_CHANGED, () => invalidateCache("/billing"));

export function invalidateCache(prefix = "") {
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
}
const COUNTER_ONLY = /^\/(cards|checklist|comments|time|notifications)(\/|$)/;
function afterWrite(path: string) {
  invalidateCache(COUNTER_ONLY.test(path) ? "/projects" : "");
}

export function setToken(token: string | null) {
  cache.clear();
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  sessionResets.forEach((reset) => reset());
}

export class UnauthorizedError extends Error {}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Locale": currentLocale(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (res.status === 401) {
    setToken(null);
    // Without a token this is a failed sign-in: show the server's reason.
    const body = token ? {} : await res.json().catch(() => ({}));
    throw new UnauthorizedError(body.message ?? t("lib.api.signInRequired"));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    throw new Error(message ?? t("lib.api.requestFailed", { status: res.status }));
  }
  if (init?.method && init.method !== "GET") afterWrite(path);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const post = <T>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
const patch = <T>(path: string, body: unknown) => apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) });
const del = (path: string) => apiFetch<void>(path, { method: "DELETE" });

export interface CardPatch {
  title: string;
  description: string | null;
  priority: CardPriority;
  startDate: string | null;
  dueDate: string | null;
  estimateHours: number | null;
  assigneeIds: string[];
  labelIds: string[];
}

export const api = {
  login: (email: string, password: string) => post<{ accessToken: string }>("/auth/login", { email, password }),
  register: (workspaceName: string, name: string, email: string, password: string) =>
    post<{ accessToken: string }>("/auth/register", { workspaceName, name, email, password, locale: currentLocale() }),
  me: () => cachedGet<UserDto>("/users/me", 30_000),
  users: () => cachedGet<UserDto[]>("/users", 30_000),

  createUser: (data: { name: string; email: string; password: string; role: UserRole; roleId?: string }) => post<UserDto>("/users", data),
  updateUser: (id: string, data: Partial<{ name: string; role: UserRole; roleId: string; isActive: boolean }>) =>
    patch<UserDto>(`/users/${id}`, data),

  resetUserPassword: (id: string, password: string) => post<void>(`/users/${id}/password`, { password }),

  template: (id: string) => apiFetch<TemplateDetailDto>(`/templates/${id}`),
  createTemplate: (data: TemplateInput) => post<{ id: string }>("/templates", data),
  saveTemplate: (id: string, data: TemplateInput) => apiFetch<TemplateDetailDto>(`/templates/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTemplate: (id: string) => del(`/templates/${id}`),
  timeReport: (from: string, to: string, userId?: string) =>
    apiFetch<unknown[]>(`/reports/time?from=${from}&to=${to}${userId ? `&userId=${userId}` : ""}`),
  // Totals and one row per person/project, counted by the server.
  timeSummary: (from: string, to: string, groupBy: "user" | "project", userId?: string) =>
    apiFetch<TimeSummaryDto>(`/reports/time/summary?from=${from}&to=${to}&groupBy=${groupBy}${userId ? `&userId=${userId}` : ""}`),
  // Entries of one group (or all of them), a page at a time.
  timeEntries: (from: string, to: string, opts: { groupBy?: "user" | "project"; key?: string; userId?: string; limit?: number; offset?: number } = {}) => {
    const query = new URLSearchParams({ from, to });
    if (opts.groupBy) query.set("groupBy", opts.groupBy);
    if (opts.key) query.set("key", opts.key);
    if (opts.userId) query.set("userId", opts.userId);
    if (opts.limit) query.set("limit", String(opts.limit));
    if (opts.offset) query.set("offset", String(opts.offset));
    return apiFetch<TimeEntriesPageDto>(`/reports/time/entries?${query}`);
  },
  templateFromProject: (projectId: string, name: string) => post<{ id: string }>(`/templates/from-project/${projectId}`, { name }),

  projects: (status?: string) => cachedGet<ProjectListItemDto[]>(`/projects${status ? `?status=${status}` : ""}`, 10_000),
  createProject: (data: { title: string; templateId?: string; deadline?: string }) =>
    post<{ id: string }>("/projects", data),
  project: (id: string) => apiFetch<ProjectListItemDto>(`/projects/${id}`),
  projectStats: (id: string) => apiFetch<{ hoursBudget: number | null; loggedMinutes: number }>(`/projects/${id}/stats`),
  projectBoard: (id: string) => apiFetch<BoardDto>(`/projects/${id}/board`),
  // One card as the board shows it (after a realtime hint).
  cardTile: (id: string) => apiFetch<CardTileDto>(`/cards/${id}/tile`),
  // Which cards contain the text (title or description): the board filter asks the server.
  matchCards: (q: string, projectId?: string) => apiFetch<{ ids: string[] }>(`/cards/match?q=${encodeURIComponent(q)}${projectId ? `&projectId=${projectId}` : ""}`),
  // `limit` loads that many cards per stage (and each stage's total).
  teamBoard: (assigneeId?: string, limit?: number) => {
    const query = new URLSearchParams();
    if (assigneeId) query.set("assigneeId", assigneeId);
    if (limit) query.set("limit", String(limit));
    return apiFetch<TeamBoardColumnDto[]>(`/team-board${query.size ? `?${query}` : ""}`);
  },
  teamSummary: (assigneeId?: string) => apiFetch<TeamStageCountDto[]>(`/team-board/summary${assigneeId ? `?assigneeId=${assigneeId}` : ""}`),
  templates: () => cachedGet<TemplateListItemDto[]>("/templates", 30_000),

  addColumn: (boardId: string, title: string) => post<ColumnDto>(`/boards/${boardId}/columns`, { title }),
  updateColumn: (id: string, data: Partial<{ title: string; wipLimit: number | null; position: number; color: LabelColor | null }>) =>
    patch<ColumnDto>(`/columns/${id}`, data),
  updateProject: (
    id: string,
    data: Partial<{
      title: string;
      status: string;
      startDate: string | null;
      deadline: string | null;
      hoursBudget: number | null;
    }>,
  ) => patch<ProjectListItemDto>(`/projects/${id}`, data),
  deleteProject: (id: string) => del(`/projects/${id}`),
  deleteColumn: (id: string) => del(`/columns/${id}`),

  settings: () => cachedGet<SettingsDto>("/settings", 30_000),
  invitations: () => apiFetch<InvitationDto[]>("/invitations"),
  invite: (data: { email: string; role?: UserRole; roleId?: string }) => post<{ id: string; email: string; link: string; emailSent: boolean }>("/invitations", data),
  revokeInvitation: (id: string) => del(`/invitations/${id}`),
  invitationPreview: (token: string) => apiFetch<{ email: string; workspaceName: string }>(`/auth/invitations/${encodeURIComponent(token)}`),
  acceptInvite: (token: string, name: string, password: string) => post<{ accessToken: string }>("/auth/accept-invite", { token, name, password }),
  forgotPassword: (email: string) => post<void>("/auth/forgot", { email }),
  resetPassword: (token: string, password: string) => post<void>("/auth/reset", { token, password }),
  agents: () => apiFetch<AgentDto[]>("/agents"),
  createAgent: (data: AgentInput) => post<AgentDto>("/agents", data),
  updateAgent: (id: string, data: Partial<AgentInput> & { isActive?: boolean }) => patch<AgentDto>(`/agents/${id}`, data),
  deleteAgent: (id: string) => del(`/agents/${id}`),
  agentRuns: (id: string) => apiFetch<AgentRunDto[]>(`/agents/${id}/runs`),
  testAgent: (data: { agentId?: string; provider: AgentProvider; model: string; baseUrl?: string | null; apiKey?: string }) => post<{ ok: true; reply: string }>("/agents/test", data),
  apiTokens: () => apiFetch<ApiTokenDto[]>("/api-tokens"),
  createApiToken: (name: string) => post<ApiTokenDto & { token: string }>("/api-tokens", { name }),
  deleteApiToken: (id: string) => del(`/api-tokens/${id}`),
  webhooks: () => apiFetch<WebhookDto[]>("/webhooks"),
  createWebhook: (data: { url: string; events: WebhookEvent[] }) => post<WebhookDto & { secret: string }>("/webhooks", data),
  updateWebhook: (id: string, data: Partial<{ url: string; events: WebhookEvent[]; isActive: boolean }>) => patch<WebhookDto>(`/webhooks/${id}`, data),
  deleteWebhook: (id: string) => del(`/webhooks/${id}`),
  rotateWebhookSecret: (id: string) => post<{ secret: string }>(`/webhooks/${id}/secret`, {}),
  testWebhook: (id: string) => post<{ ok: boolean }>(`/webhooks/${id}/test`, {}),
  webhookDeliveries: (id: string) => apiFetch<WebhookDeliveryDto[]>(`/webhooks/${id}/deliveries`),
  calendarFeed: () => apiFetch<{ url: string }>("/calendar/feed"),
  resetCalendarFeed: () => post<{ url: string }>("/calendar/feed/reset", {}),
  labels: () => cachedGet<LabelDto[]>("/labels", 30_000),
  createLabel: (name: string, color: LabelColor) => post<LabelDto>("/labels", { name, color }),
  updateLabel: (id: string, data: Partial<{ name: string; color: LabelColor }>) => patch<LabelDto>(`/labels/${id}`, data),
  deleteLabel: (id: string) => del(`/labels/${id}`),
  dependencies: (projectId: string) => apiFetch<{ cardId: string; dependsOnId: string }[]>(`/projects/${projectId}/dependencies`),
  addDependency: (cardId: string, dependsOnId: string) => post<{ cardId: string; dependsOnId: string }>(`/cards/${cardId}/dependencies`, { dependsOnId }),
  removeDependency: (cardId: string, dependsOnId: string) => del(`/cards/${cardId}/dependencies/${dependsOnId}`),
  fields: () => cachedGet<CustomFieldDto[]>("/fields", 30_000),
  createField: (data: { name: string; type: CustomFieldType; options?: string[] }) => post<CustomFieldDto>("/fields", data),
  updateField: (id: string, data: Partial<{ name: string; options: string[] }>) => patch<CustomFieldDto>(`/fields/${id}`, data),
  deleteField: (id: string) => del(`/fields/${id}`),
  setFieldValue: (cardId: string, fieldId: string, value: CustomFieldValue | null) =>
    apiFetch<void>(`/cards/${cardId}/fields/${fieldId}`, { method: "PUT", body: JSON.stringify({ value }) }),
  audit: (before?: string, group?: string) =>
    apiFetch<{ items: AuditEntryDto[]; next: string | null }>(`/audit?${new URLSearchParams({ ...(before ? { before } : {}), ...(group ? { group } : {}) })}`),
  onboarding: () => apiFetch<OnboardingDto>("/onboarding"),
  onboardingWelcomeSeen: () => post<void>("/onboarding/welcome-seen", {}),
  onboardingClose: () => post<void>("/onboarding/close", {}),
  onboardingReopen: () => post<void>("/onboarding/reopen", {}),
  createSampleProject: () => post<{ id: string }>("/onboarding/sample-project", {}),
  switchToFree: () =>
    post<void>("/billing/free", {}).then(() => {
      // The read-only banner in the shell re-checks the subscription.
      if (typeof window !== "undefined") window.dispatchEvent(new Event(BILLING_CHANGED));
    }),
  platformStats: () => apiFetch<PlatformStats>("/platform/stats"),
  platformWorkspaces: (params: { q?: string; state?: string; cursor?: string }) =>
    apiFetch<{ items: PlatformWorkspaceRow[]; next: string | null }>(`/platform/workspaces?${new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][])}`),
  platformWorkspace: (id: string) => apiFetch<PlatformWorkspaceDetail>(`/platform/workspaces/${id}`),
  platformChangeSubscription: (id: string, body: { action: "grant" | "extend-trial" | "lock" | "free" | "seats"; planId?: string; days?: number; seats?: number }) =>
    post<PlatformWorkspaceDetail>(`/platform/workspaces/${id}/subscription`, body),
  billing: () => cachedGet<BillingDto>("/billing", 15_000),
  checkout: (planId: string, interval: BillingInterval, seats: number) =>
    post<{ paymentUrl: string }>("/billing/checkout", { planId, interval, seats }),
  requestInvoice: (body: { planId: string; interval: BillingInterval; seats: number; addSeats?: number } & InvoicePayer) =>
    post<{ id: string; invoiceNumber: number; pdf: boolean }>("/billing/invoice", body),
  buySeats: (seats: number) => post<{ paymentUrl: string }>("/billing/seats", { seats }),
  cancelInvoice: (id: string) => post<void>(`/billing/invoice/${id}/cancel`, {}),
  platformInvoices: () => apiFetch<PlatformInvoice[]>("/platform/invoices"),
  platformInvoicePaid: (id: string) => post<void>(`/platform/invoices/${id}/paid`, {}),
  mockPay: (orderId: string, success: boolean) => post<void>(`/billing/dev/pay/${encodeURIComponent(orderId)}`, { success }),
  roles: () => cachedGet<RoleDto[]>("/roles", 30_000),
  createRole: (data: { name: string; permissions?: string[] }) => post<RoleDto>("/roles", data),
  updateRole: (id: string, data: Partial<{ name: string; permissions: string[]; isDefault: boolean }>) => patch<RoleDto>(`/roles/${id}`, data),
  deleteRole: (id: string) => del(`/roles/${id}`),
  updateSettings: (data: Partial<SettingsDto>) => patch<SettingsDto>("/settings", data),

  updateMe: (data: Partial<{ name: string; email: string; emailNotifications: boolean; locale: Locale }>) => patch<UserDto>("/users/me", data),
  changePassword: (currentPassword: string, newPassword: string) =>
    post<void>("/users/me/password", { currentPassword, newPassword }),
  setAvatar: (avatarUrl: string | null) =>
    apiFetch<UserDto>("/users/me/avatar", { method: "PUT", body: JSON.stringify({ avatarUrl }) }),

  card: (id: string) => apiFetch<CardDetailDto>(`/cards/${id}`),
  urgentCount: (before: Date | string) => apiFetch<{ count: number }>(`/cards/urgent-count?before=${encodeURIComponent(typeof before === "string" ? before : before.toISOString())}`),
  searchCards: (q: string) => apiFetch<CardTileDto[]>(`/cards/search?q=${encodeURIComponent(q)}`),
  createCard: (columnId: string, title: string) => post<CardTileDto>("/cards", { columnId, title }),
  moveCard: (id: string, columnId: string, position?: number) =>
    post<CardTileDto>(`/cards/${id}/move`, { columnId, position }),
  updateCard: (id: string, data: Partial<CardPatch>) => patch<CardTileDto>(`/cards/${id}`, data),
  deleteCard: (id: string) => del(`/cards/${id}`),

  addChecklistItem: (cardId: string, text: string) => post<ChecklistItemDto>(`/cards/${cardId}/checklist`, { text }),
  updateChecklistItem: (itemId: string, data: { text?: string; done?: boolean }) =>
    patch<ChecklistItemDto>(`/checklist/${itemId}`, data),
  deleteChecklistItem: (itemId: string) => del(`/checklist/${itemId}`),

  addComment: (cardId: string, text: string, mentionIds: string[] = [], attachmentIds: string[] = []) =>
    post<CommentDto>(`/cards/${cardId}/comments`, { text, mentionIds, attachmentIds }),
  bulkCards: (ids: string[], action: BulkAction, extra: Partial<{ columnId: string; userIds: string[]; priority: CardPriority; dueDate: string | null }> = {}) =>
    post<{ count: number }>("/cards/bulk", { ids, action, ...extra }),
  deleteAttachment: (id: string) => del(`/attachments/${id}`),
  recurring: (projectId: string) => apiFetch<RecurringRuleDto[]>(`/projects/${projectId}/recurring`),
  createRecurring: (projectId: string, data: RecurringInput) => post<RecurringRuleDto>(`/projects/${projectId}/recurring`, data),
  updateRecurring: (id: string, data: RecurringInput) => apiFetch<RecurringRuleDto>(`/recurring/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  toggleRecurring: (id: string, active: boolean) => patch<RecurringRuleDto>(`/recurring/${id}`, { active }),
  runRecurring: (id: string) => post<{ id: string }>(`/recurring/${id}/run`, {}),
  deleteRecurring: (id: string) => del(`/recurring/${id}`),
  markCardRead: (cardId: string) => post<void>(`/cards/${cardId}/read`, {}),
  notifications: () => apiFetch<{ items: NotificationDto[]; unread: number }>("/notifications"),
  markNotificationsRead: (ids?: string[]) => post<void>("/notifications/read", { ids }),
  deleteComment: (commentId: string) => del(`/comments/${commentId}`),

  addTimeEntry: (cardId: string, data: { minutes: number; date: string; note?: string }) =>
    post<TimeEntryDto>(`/cards/${cardId}/time`, data),
  deleteTimeEntry: (entryId: string) => del(`/time/${entryId}`),
};
