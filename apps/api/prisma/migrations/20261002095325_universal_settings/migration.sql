-- Client: amoCRM subdomain → generic website link (existing values kept as full URLs).
ALTER TABLE "Client" ADD COLUMN "website" TEXT;
UPDATE "Client"
SET "website" = CASE
  WHEN "amoSubdomain" ~ '^https?://' THEN "amoSubdomain"
  WHEN "amoSubdomain" LIKE '%.%' THEN 'https://' || "amoSubdomain"
  ELSE 'https://' || "amoSubdomain" || '.amocrm.ru'
END
WHERE "amoSubdomain" IS NOT NULL AND "amoSubdomain" <> '';
ALTER TABLE "Client" DROP COLUMN "amoSubdomain";

-- Workspace settings (single row).
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "workspaceName" TEXT NOT NULL DEFAULT 'Канбан',
    "cardPrefix" TEXT NOT NULL DEFAULT 'TSK',
    "defaultColumns" TEXT[] DEFAULT ARRAY['Бэклог', 'В работе', 'На проверке', 'Готово']::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);
INSERT INTO "Settings" ("id") VALUES (1);
