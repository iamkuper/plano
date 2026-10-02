import { AsyncLocalStorage } from "async_hooks";
import { Prisma, PrismaClient } from "@prisma/client";

// Tenant isolation lives here, below the services: every query made through
// the scoped client (PrismaService) is restricted to the current workspace,
// and a query without a workspace context fails instead of running unscoped.
// Code that legitimately works across workspaces (login, the recurring-task
// scheduler, signed file links) uses SystemPrismaService.

interface TenantContext {
  workspaceId: string;
}

const storage = new AsyncLocalStorage<TenantContext>();

export const runInWorkspace = <T>(workspaceId: string, fn: () => T): T => storage.run({ workspaceId }, fn);

export const currentWorkspaceId = () => storage.getStore()?.workspaceId;

type Where = Record<string, unknown>;

// How each model reaches its workspace.
const SCOPE: Record<string, (ws: string) => Where> = {
  Workspace: (ws) => ({ id: ws }),
  User: (ws) => ({ workspaceId: ws }),
  Project: (ws) => ({ workspaceId: ws }),
  Card: (ws) => ({ workspaceId: ws }),
  Template: (ws) => ({ workspaceId: ws }),
  Role: (ws) => ({ workspaceId: ws }),
  Subscription: (ws) => ({ workspaceId: ws }),
  Invitation: (ws) => ({ workspaceId: ws }),
  Label: (ws) => ({ workspaceId: ws }),
  CardLabel: (ws) => ({ card: { workspaceId: ws } }),
  CardDependency: (ws) => ({ card: { workspaceId: ws } }),
  CustomField: (ws) => ({ workspaceId: ws }),
  CardFieldValue: (ws) => ({ card: { workspaceId: ws } }),
  Payment: (ws) => ({ workspaceId: ws }),
  Board: (ws) => ({ project: { workspaceId: ws } }),
  Column: (ws) => ({ board: { project: { workspaceId: ws } } }),
  RecurringRule: (ws) => ({ project: { workspaceId: ws } }),
  TemplateCard: (ws) => ({ template: { workspaceId: ws } }),
  CardAssignee: (ws) => ({ card: { workspaceId: ws } }),
  ChecklistItem: (ws) => ({ card: { workspaceId: ws } }),
  Comment: (ws) => ({ card: { workspaceId: ws } }),
  TimeEntry: (ws) => ({ card: { workspaceId: ws } }),
  ActivityLog: (ws) => ({ card: { workspaceId: ws } }),
  Notification: (ws) => ({ card: { workspaceId: ws } }),
  CardRead: (ws) => ({ card: { workspaceId: ws } }),
  Attachment: (ws) => ({ card: { workspaceId: ws } }),
};

// Models that carry workspaceId themselves: it is set from the context on
// create, never taken from the caller.
const OWN = new Set(["User", "Project", "Card", "Template", "Role", "Subscription", "Payment", "Invitation", "Label", "CustomField"]);

// Shared catalogue, not tenant data: readable by everyone, never writable here.
const GLOBAL_READ = new Set(["Plan"]);
const READS = new Set(["findFirst", "findFirstOrThrow", "findUnique", "findUniqueOrThrow", "findMany", "count", "aggregate", "groupBy"]);

// Foreign keys that must point into the same workspace when written.
const PARENTS: Record<string, Record<string, string>> = {
  User: { roleId: "Role" },
  Invitation: { roleId: "Role", invitedById: "User" },
  Card: { projectId: "Project", columnId: "Column", recurringRuleId: "RecurringRule" },
  Board: { projectId: "Project" },
  Column: { boardId: "Board" },
  RecurringRule: { projectId: "Project" },
  TemplateCard: { templateId: "Template" },
  CardAssignee: { cardId: "Card", userId: "User" },
  ChecklistItem: { cardId: "Card" },
  Comment: { cardId: "Card", authorId: "User" },
  TimeEntry: { cardId: "Card", userId: "User" },
  ActivityLog: { cardId: "Card", userId: "User" },
  Notification: { cardId: "Card", userId: "User", actorId: "User" },
  CardRead: { cardId: "Card", userId: "User" },
  CardLabel: { cardId: "Card", labelId: "Label" },
  CardDependency: { cardId: "Card", dependsOnId: "Card" },
  CardFieldValue: { cardId: "Card", fieldId: "CustomField" },
  Attachment: { cardId: "Card", commentId: "Comment", uploaderId: "User" },
};

const UNIQUE_WHERE = new Set(["findUnique", "findUniqueOrThrow", "update", "delete", "upsert"]);
const FILTERED = new Set(["findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy", "updateMany", "deleteMany"]);

const lower = (s: string) => s[0].toLowerCase() + s.slice(1);

export function scopedClient(base: PrismaClient) {
  const delegate = (model: string) => (base as unknown as Record<string, { count(a: unknown): Promise<number> }>)[lower(model)];

  // Every non-null FK value in `data` must exist inside the workspace.
  async function assertParents(model: string, rows: Record<string, unknown>[], ws: string) {
    const fks = PARENTS[model];
    if (!fks) return;
    for (const [field, parent] of Object.entries(fks)) {
      const ids = [...new Set(rows.map((r) => r[field]).filter((v): v is string => typeof v === "string"))];
      if (!ids.length) continue;
      const found = await delegate(parent).count({ where: { id: { in: ids }, ...SCOPE[parent](ws) } });
      if (found !== ids.length) throw new Prisma.PrismaClientKnownRequestError("Record not found", { code: "P2025", clientVersion: Prisma.prismaVersion.client });
    }
  }

  return base.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const ws = currentWorkspaceId();
          if (!ws) throw new Error(`Нет контекста рабочего пространства для ${model}.${operation}`);
          if (GLOBAL_READ.has(model)) {
            if (!READS.has(operation)) throw new Error(`${model} нельзя менять из рабочего пространства`);
            return query(args);
          }
          const scope = SCOPE[model];
          if (!scope) throw new Error(`Модель ${model} не описана в SCOPE`);
          const a = (args ?? {}) as Record<string, any>;

          if (UNIQUE_WHERE.has(operation)) {
            // Unique lookups keep their unique key; the scope rides in AND.
            const rest = a.where?.AND ?? [];
            a.where = { ...a.where, AND: [scope(ws), ...(Array.isArray(rest) ? rest : [rest])] };
          } else if (FILTERED.has(operation)) {
            a.where = a.where ? { AND: [a.where, scope(ws)] } : scope(ws);
          }

          switch (operation) {
            case "create":
            case "createMany":
            case "createManyAndReturn":
            case "upsert": {
              const payload = operation === "upsert" ? a.create : a.data;
              const rows: Record<string, unknown>[] = Array.isArray(payload) ? payload : [payload];
              for (const row of rows) {
                if (OWN.has(model)) row.workspaceId = ws;
                if (model === "Card" && !row.number) {
                  const { cardCounter } = await base.workspace.update({ where: { id: ws }, data: { cardCounter: { increment: 1 } }, select: { cardCounter: true } });
                  row.number = cardCounter;
                }
              }
              await assertParents(model, rows, ws);
              break;
            }
            case "update":
            case "updateMany":
              if (a.data) await assertParents(model, [a.data], ws);
              break;
          }
          return query(a);
        },
      },
    },
  });
}

// Create calls must satisfy the generated types, which require these fields,
// but the scope above always sets them from the request's workspace. Spread
// this into the data of User/Project/Template/Role creates (and CARD for
// cards) to make that explicit; it is empty at runtime.
export const OWN_FIELDS = {} as { workspaceId: string };
export const CARD_FIELDS = {} as { workspaceId: string; number: number };
