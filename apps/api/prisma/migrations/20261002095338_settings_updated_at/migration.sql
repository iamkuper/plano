-- Prisma manages updatedAt itself; no DB default.
ALTER TABLE "Settings" ALTER COLUMN "updatedAt" DROP DEFAULT;
