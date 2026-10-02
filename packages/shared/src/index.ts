// Types shared between api and web. Kept as plain string unions (not Prisma
// enums) so the web app doesn't depend on @prisma/client.

export type UserRole = "ADMIN" | "MEMBER";
export type ProjectStatus = "ACTIVE" | "ON_HOLD" | "DONE" | "ARCHIVED";
export type CardPriority = "LOW" | "MEDIUM" | "HIGH";
export type CardType = "SETUP" | "INTEGRATION" | "WIDGET" | "TRAINING" | "BUG" | "OTHER";

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
  { key: "projects.create", label: "Создавать проекты" },
  { key: "projects.edit", label: "Менять проекты", hint: "Название, сроки, статус, этапы доски, повторяющиеся задачи" },
  { key: "projects.delete", label: "Удалять проекты" },
  { key: "cards.delete", label: "Удалять карточки" },
  { key: "templates.manage", label: "Создавать и менять шаблоны" },
  { key: "time.viewAll", label: "Видеть время всех сотрудников", hint: "Без этого права в отчёте видно только своё время" },
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

export const DEFAULT_COLUMNS = ["Бэклог", "В работе", "На проверке", "Готово"];

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  SETUP: "Настройка",
  INTEGRATION: "Интеграция",
  WIDGET: "Разработка",
  TRAINING: "Обучение",
  BUG: "Ошибка",
  OTHER: "Другое",
};

export const CARD_PRIORITY_LABELS: Record<CardPriority, string> = {
  HIGH: "Высокий",
  MEDIUM: "Средний",
  LOW: "Низкий",
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  ACTIVE: "В работе",
  ON_HOLD: "На паузе",
  DONE: "Завершён",
  ARCHIVED: "В архиве",
};

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

export interface CardTileDto {
  id: string;
  number: number;
  columnId: string;
  title: string;
  description: string | null;
  type: CardType;
  priority: CardPriority;
  position: number;
  dueDate: string | null;
  estimateHours: number | null;
  updatedAt: string;
  assignees: { user: UserRefDto }[];
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
  type: CardType;
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

export interface CardDetailDto extends Omit<CardTileDto, "checklist"> {
  attachments: AttachmentDto[];
  recurringRule?: { id: string; frequency: RecurrenceFrequency; interval: number; active: boolean } | null;
  column: { id: string; title: string };
  checklist: ChecklistItemDto[];
  comments: CommentDto[];
  timeEntries: TimeEntryDto[];
  activity: ActivityDto[];
}

// Field names in ActivityLog "updated" payloads → human labels.
export const CARD_FIELD_LABELS: Record<string, string> = {
  title: "название",
  description: "описание",
  type: "тип",
  priority: "приоритет",
  dueDate: "срок",
  estimateHours: "оценку",
  assigneeIds: "исполнителей",
};

export type NotificationType = "ASSIGNED" | "MENTIONED" | "COMMENTED";

export interface NotificationDto {
  id: string;
  type: NotificationType;
  text: string | null;
  readAt: string | null;
  createdAt: string;
  actor: UserRefDto;
  card: { id: string; number: number; title: string; projectId: string };
}
