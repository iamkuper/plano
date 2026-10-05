-- Task types become workspace data. Every workspace gets one default type
-- ("Задача"); existing cards, template cards and recurring rules move to it.

CREATE TABLE "TaskType" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TaskType_workspaceId_name_key" ON "TaskType"("workspaceId", "name");
CREATE INDEX "TaskType_workspaceId_idx" ON "TaskType"("workspaceId");
ALTER TABLE "TaskType" ADD CONSTRAINT "TaskType_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "TaskType" ("id", "workspaceId", "name", "position", "isDefault")
SELECT 'tt_' || "id", "id", 'Задача', 0, true FROM "Workspace";

ALTER TABLE "Card" ADD COLUMN "typeId" TEXT;
ALTER TABLE "TemplateCard" ADD COLUMN "typeId" TEXT;
ALTER TABLE "RecurringRule" ADD COLUMN "typeId" TEXT;

UPDATE "Card" c SET "typeId" = 'tt_' || c."workspaceId";
UPDATE "TemplateCard" tc SET "typeId" = 'tt_' || t."workspaceId" FROM "Template" t WHERE t."id" = tc."templateId";
UPDATE "RecurringRule" r SET "typeId" = 'tt_' || p."workspaceId" FROM "Project" p WHERE p."id" = r."projectId";

ALTER TABLE "Card" ALTER COLUMN "typeId" SET NOT NULL;
ALTER TABLE "TemplateCard" ALTER COLUMN "typeId" SET NOT NULL;
ALTER TABLE "RecurringRule" ALTER COLUMN "typeId" SET NOT NULL;

ALTER TABLE "Card" DROP COLUMN "type";
ALTER TABLE "TemplateCard" DROP COLUMN "type";
ALTER TABLE "RecurringRule" DROP COLUMN "type";
DROP TYPE "CardType";

ALTER TABLE "Card" ADD CONSTRAINT "Card_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "TaskType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TemplateCard" ADD CONSTRAINT "TemplateCard_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "TaskType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "TaskType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
