-- CreateEnum
CREATE TYPE "CardPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "Card" ADD COLUMN "priority" "CardPriority" NOT NULL DEFAULT 'MEDIUM';
