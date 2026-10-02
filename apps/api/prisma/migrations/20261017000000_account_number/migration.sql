-- Public numeric account ID, starting at 100001, in order of creation.
CREATE SEQUENCE "Workspace_accountNumber_seq" START 100001;
ALTER TABLE "Workspace" ADD COLUMN "accountNumber" INTEGER;
UPDATE "Workspace" w SET "accountNumber" = n.num
FROM (SELECT "id", 100000 + ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS num FROM "Workspace") n
WHERE n."id" = w."id";
SELECT setval('"Workspace_accountNumber_seq"', COALESCE((SELECT MAX("accountNumber") FROM "Workspace"), 100000) + 1, false);
ALTER TABLE "Workspace" ALTER COLUMN "accountNumber" SET DEFAULT nextval('"Workspace_accountNumber_seq"');
ALTER TABLE "Workspace" ALTER COLUMN "accountNumber" SET NOT NULL;
ALTER SEQUENCE "Workspace_accountNumber_seq" OWNED BY "Workspace"."accountNumber";
CREATE UNIQUE INDEX "Workspace_accountNumber_key" ON "Workspace"("accountNumber");
