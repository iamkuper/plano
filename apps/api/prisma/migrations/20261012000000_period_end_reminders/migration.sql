ALTER TABLE "Subscription" ADD COLUMN "endReminderFor" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN "endReminderStage" INTEGER NOT NULL DEFAULT 0;
