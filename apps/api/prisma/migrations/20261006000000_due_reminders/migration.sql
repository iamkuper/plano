ALTER TYPE "NotificationType" ADD VALUE 'DUE_SOON';
ALTER TYPE "NotificationType" ADD VALUE 'OVERDUE';

ALTER TABLE "Notification" ALTER COLUMN "actorId" DROP NOT NULL;
ALTER TABLE "Notification" ADD COLUMN "dueFor" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "emailNotifications" BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX "Notification_userId_cardId_type_dueFor_key" ON "Notification"("userId", "cardId", "type", "dueFor");
