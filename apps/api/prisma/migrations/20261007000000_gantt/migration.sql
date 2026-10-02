ALTER TABLE "Card" ADD COLUMN "startDate" TIMESTAMP(3);

CREATE TABLE "CardDependency" (
    "cardId" TEXT NOT NULL,
    "dependsOnId" TEXT NOT NULL,

    CONSTRAINT "CardDependency_pkey" PRIMARY KEY ("cardId","dependsOnId")
);

CREATE INDEX "CardDependency_dependsOnId_idx" ON "CardDependency"("dependsOnId");

ALTER TABLE "CardDependency" ADD CONSTRAINT "CardDependency_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardDependency" ADD CONSTRAINT "CardDependency_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The Gantt chart is a Business feature.
UPDATE "Plan" SET "features" = array_append("features", 'gantt') WHERE "id" = 'BUSINESS';
