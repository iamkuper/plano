-- Multi-tenancy: Workspace replaces the single-row Settings; User, Project,
-- Card, Template and Role get a workspaceId. Existing data moves into one
-- workspace (the old settings), if there is any data at all.

CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Канбан',
    "cardPrefix" TEXT NOT NULL DEFAULT 'TSK',
    "cardCounter" INTEGER NOT NULL DEFAULT 0,
    "defaultColumns" TEXT[] DEFAULT ARRAY['Бэклог', 'В работе', 'На проверке', 'Готово']::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Workspace" ("id", "name", "cardPrefix", "defaultColumns", "updatedAt")
SELECT 'ws_initial', "workspaceName", "cardPrefix", "defaultColumns", "updatedAt" FROM "Settings" WHERE "id" = 1;

INSERT INTO "Workspace" ("id")
SELECT 'ws_initial'
WHERE NOT EXISTS (SELECT 1 FROM "Workspace")
  AND (EXISTS (SELECT 1 FROM "User") OR EXISTS (SELECT 1 FROM "Project") OR EXISTS (SELECT 1 FROM "Template") OR EXISTS (SELECT 1 FROM "Role"));

DROP TABLE "Settings";

ALTER TABLE "User" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Project" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Card" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Template" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Role" ADD COLUMN "workspaceId" TEXT;

UPDATE "User" SET "workspaceId" = 'ws_initial';
UPDATE "Project" SET "workspaceId" = 'ws_initial';
UPDATE "Card" SET "workspaceId" = 'ws_initial';
UPDATE "Template" SET "workspaceId" = 'ws_initial';
UPDATE "Role" SET "workspaceId" = 'ws_initial';

ALTER TABLE "User" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Project" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Card" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Template" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Role" ALTER COLUMN "workspaceId" SET NOT NULL;

-- Card numbers are issued per workspace from Workspace.cardCounter.
ALTER TABLE "Card" ALTER COLUMN "number" DROP DEFAULT;
DROP SEQUENCE IF EXISTS "Card_number_seq";
DROP INDEX "Card_number_key";
UPDATE "Workspace" w SET "cardCounter" = COALESCE((SELECT MAX("number") FROM "Card" c WHERE c."workspaceId" = w."id"), 0);

DROP INDEX "Role_name_key";

CREATE UNIQUE INDEX "Card_workspaceId_number_key" ON "Card"("workspaceId", "number");
CREATE UNIQUE INDEX "Role_workspaceId_name_key" ON "Role"("workspaceId", "name");
CREATE INDEX "User_workspaceId_idx" ON "User"("workspaceId");
CREATE INDEX "Project_workspaceId_idx" ON "Project"("workspaceId");
CREATE INDEX "Template_workspaceId_idx" ON "Template"("workspaceId");

ALTER TABLE "User" ADD CONSTRAINT "User_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Card" ADD CONSTRAINT "Card_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Template" ADD CONSTRAINT "Template_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Role" ADD CONSTRAINT "Role_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Workspace" ALTER COLUMN "updatedAt" DROP DEFAULT;
