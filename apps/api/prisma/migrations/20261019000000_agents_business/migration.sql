-- AI agents are a Business feature.
UPDATE "Plan" SET "features" = array_append("features", 'agents') WHERE "id" = 'BUSINESS' AND NOT ('agents' = ANY("features"));
