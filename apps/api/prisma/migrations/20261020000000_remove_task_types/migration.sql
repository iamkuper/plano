-- DropForeignKey
ALTER TABLE "Card" DROP CONSTRAINT "Card_typeId_fkey";

-- DropForeignKey
ALTER TABLE "RecurringRule" DROP CONSTRAINT "RecurringRule_typeId_fkey";

-- DropForeignKey
ALTER TABLE "TaskType" DROP CONSTRAINT "TaskType_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "TemplateCard" DROP CONSTRAINT "TemplateCard_typeId_fkey";

-- AlterTable
ALTER TABLE "Card" DROP COLUMN "typeId";

-- AlterTable
ALTER TABLE "RecurringRule" DROP COLUMN "typeId";

-- AlterTable
ALTER TABLE "TemplateCard" DROP COLUMN "typeId";

-- DropTable
DROP TABLE "TaskType";


-- The permission to configure task types no longer exists.
UPDATE "Role" SET "permissions" = array_remove("permissions", 'types.manage');
