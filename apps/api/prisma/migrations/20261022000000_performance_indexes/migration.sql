-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateIndex
CREATE INDEX "Card_title_trgm_idx" ON "Card" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Card_description_trgm_idx" ON "Card" USING GIN ("description" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "CardAssignee_userId_idx" ON "CardAssignee"("userId");

-- CreateIndex
CREATE INDEX "TimeEntry_date_idx" ON "TimeEntry"("date");

