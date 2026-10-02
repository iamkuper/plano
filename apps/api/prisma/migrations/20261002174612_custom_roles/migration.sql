-- AlterTable
ALTER TABLE "User" ADD COLUMN     "roleId" TEXT;

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" TEXT[],
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Move the single member permission set into a default "Сотрудник" role.
INSERT INTO "Role" ("id", "name", "permissions", "isDefault")
SELECT 'role_member', 'Сотрудник',
       COALESCE((SELECT "memberPermissions" FROM "Settings" WHERE "id" = 1),
                ARRAY['projects.create', 'projects.edit', 'cards.delete', 'time.viewAll']::TEXT[]),
       true;
UPDATE "User" SET "roleId" = 'role_member' WHERE "role" = 'MEMBER';

ALTER TABLE "Settings" DROP COLUMN "memberPermissions";
