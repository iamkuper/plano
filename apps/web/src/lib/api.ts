import type {
  BillingDto,
  BillingInterval,
  BoardDto,
  CardDetailDto,
  CardTileDto,
  CardPriority,
  TaskTypeDto,
  TaskTypeRefDto,
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
  TemplateListItemDto,
  TimeEntryDto,
  UserDto,
  UserRole,
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
  name: string;
  createdAt: string;
  state: PlatformState;
  storageBytes: number;
  subscription: { planId: string; status: string; interval: string; trialEndsAt: string | null; currentPeriodEnd: string | null; cardMask: string | null; cancelAtPeriodEnd: boolean } | null;
  users: { id: string; name: string; email: string; role: string; isActive: boolean; createdAt: string }[];
  payments: { id: string; kind: string; planId: string; seats: number; amount: number; status: string; createdAt: string; paidAt: string | null }[];
  auditLog: { id: string; action: string; summary: string; createdAt: string }[];
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

export type BulkAction = "move" | "assign" | "unassign" | "priority" | "due" | "delete";

export interface RecurringInput {
  title: string;
  description?: string | null;
  typeId?: string;
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


export interface TemplateCardInput {
  title: string;
  description?: string | null;
  typeId?: string;
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

export function setToken(token: string | null) {
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
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const post = <T>(path: string, body: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
const patch = <T>(path: string, body: unknown) => apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) });
const del = (path: string) => apiFetch<void>(path, { method: "DELETE" });

export interface CardPatch {
  title: string;
  description: string | null;
  typeId: string;
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
  me: () => apiFetch<UserDto>("/users/me"),
  users: () => apiFetch<UserDto[]>("/users"),

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
  templateFromProject: (projectId: string, name: string) => post<{ id: string }>(`/templates/from-project/${projectId}`, { name }),

  projects: (status?: string) => apiFetch<ProjectListItemDto[]>(`/projects${status ? `?status=${status}` : ""}`),
  createProject: (data: { title: string; templateId?: string; deadline?: string }) =>
    post<{ id: string }>("/projects", data),
  project: (id: string) => apiFetch<ProjectListItemDto>(`/projects/${id}`),
  projectStats: (id: string) => apiFetch<{ hoursBudget: number | null; loggedMinutes: number }>(`/projects/${id}/stats`),
  projectBoard: (id: string) => apiFetch<BoardDto>(`/projects/${id}/board`),
  teamBoard: (assigneeId?: string) =>
    apiFetch<TeamBoardColumnDto[]>(`/team-board${assigneeId ? `?assigneeId=${assigneeId}` : ""}`),
  templates: () => apiFetch<TemplateListItemDto[]>("/templates"),

  addColumn: (boardId: string, title: string) => post<ColumnDto>(`/boards/${boardId}/columns`, { title }),
  updateColumn: (id: string, data: Partial<{ title: string; wipLimit: number | null; position: number }>) =>
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

  settings: () => apiFetch<SettingsDto>("/settings"),
  invitations: () => apiFetch<InvitationDto[]>("/invitations"),
  invite: (data: { email: string; role?: UserRole; roleId?: string }) => post<{ id: string; email: string; link: string; emailSent: boolean }>("/invitations", data),
  revokeInvitation: (id: string) => del(`/invitations/${id}`),
  invitationPreview: (token: string) => apiFetch<{ email: string; workspaceName: string }>(`/auth/invitations/${encodeURIComponent(token)}`),
  acceptInvite: (token: string, name: string, password: string) => post<{ accessToken: string }>("/auth/accept-invite", { token, name, password }),
  forgotPassword: (email: string) => post<void>("/auth/forgot", { email }),
  resetPassword: (token: string, password: string) => post<void>("/auth/reset", { token, password }),
  taskTypes: () => apiFetch<TaskTypeDto[]>("/task-types"),
  createTaskType: (name: string, color: LabelColor | null) => post<TaskTypeDto>("/task-types", { name, color }),
  updateTaskType: (id: string, data: Partial<{ name: string; color: LabelColor | null; isDefault: boolean }>) => patch<TaskTypeDto>(`/task-types/${id}`, data),
  deleteTaskType: (id: string) => del(`/task-types/${id}`),
  labels: () => apiFetch<LabelDto[]>("/labels"),
  createLabel: (name: string, color: LabelColor) => post<LabelDto>("/labels", { name, color }),
  updateLabel: (id: string, data: Partial<{ name: string; color: LabelColor }>) => patch<LabelDto>(`/labels/${id}`, data),
  deleteLabel: (id: string) => del(`/labels/${id}`),
  dependencies: (projectId: string) => apiFetch<{ cardId: string; dependsOnId: string }[]>(`/projects/${projectId}/dependencies`),
  addDependency: (cardId: string, dependsOnId: string) => post<{ cardId: string; dependsOnId: string }>(`/cards/${cardId}/dependencies`, { dependsOnId }),
  removeDependency: (cardId: string, dependsOnId: string) => del(`/cards/${cardId}/dependencies/${dependsOnId}`),
  fields: () => apiFetch<CustomFieldDto[]>("/fields"),
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
  platformChangeSubscription: (id: string, body: { action: "grant" | "extend-trial" | "lock" | "free"; planId?: string; days?: number }) =>
    post<PlatformWorkspaceDetail>(`/platform/workspaces/${id}/subscription`, body),
  billing: () => apiFetch<BillingDto>("/billing"),
  checkout: (planId: string, interval: BillingInterval) => post<{ paymentUrl: string }>("/billing/checkout", { planId, interval }),
  cancelSubscription: (cancel: boolean) => post<void>("/billing/cancel", { cancel }),
  mockPay: (orderId: string, success: boolean) => post<void>(`/billing/dev/pay/${encodeURIComponent(orderId)}`, { success }),
  roles: () => apiFetch<RoleDto[]>("/roles"),
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
