-- AlterTable: SERIAL backfills existing rows from the sequence.
ALTER TABLE "Card" ADD COLUMN "number" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Card_number_key" ON "Card"("number");
