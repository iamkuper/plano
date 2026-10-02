ALTER TYPE "SubscriptionStatus" ADD VALUE 'LOCKED';

ALTER TABLE "User" ADD COLUMN "welcomeSeenAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "onboardingClosedAt" TIMESTAMP(3);

-- People who were already here don't get the onboarding.
UPDATE "User" SET "welcomeSeenAt" = CURRENT_TIMESTAMP, "onboardingClosedAt" = CURRENT_TIMESTAMP;
