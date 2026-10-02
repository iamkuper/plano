-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_clientId_fkey";

-- DropIndex
DROP INDEX "Project_clientId_idx";

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "clientId";

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "memberPermissions" TEXT[] DEFAULT ARRAY['projects.create', 'projects.edit', 'cards.delete', 'time.viewAll']::TEXT[];

-- DropTable
DROP TABLE "Client";

