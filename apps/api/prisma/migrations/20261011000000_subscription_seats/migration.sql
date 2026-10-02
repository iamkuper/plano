-- Paid user seats per subscription.
ALTER TABLE "Subscription" ADD COLUMN "seats" INTEGER;

-- Paid subscriptions keep the seats of their last paid payment.
UPDATE "Subscription" s SET "seats" = p."seats"
FROM (
  SELECT DISTINCT ON ("workspaceId") "workspaceId", "seats"
  FROM "Payment" WHERE "status" = 'PAID'
  ORDER BY "workspaceId", "paidAt" DESC
) p
WHERE p."workspaceId" = s."workspaceId" AND s."planId" <> 'FREE' AND s."status" <> 'TRIALING';
