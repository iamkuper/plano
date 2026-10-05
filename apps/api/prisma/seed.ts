import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { DEFAULT_TYPE_NAME, defaultTemplateNames, templateCreateData } from "../src/templates/default-template";

const prisma = new PrismaClient();


// Local test admin in its own workspace, created or updated in place.
// Idempotent: the starter template is replaced by name.
async function seedAdmin(email: string, password: string, name: string, workspaceName: string) {
  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findUnique({ where: { email } });
  const workspaceId = existing?.workspaceId ?? (await prisma.workspace.create({ data: { name: workspaceName, subscription: { create: { planId: "PRO", status: "TRIALING", trialEndsAt: new Date(Date.now() + 14 * 86_400_000) } } } })).id;
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, isActive: true, role: "ADMIN" },
    create: { email, name, role: "ADMIN", passwordHash, workspaceId },
  });
  const type =
    (await prisma.taskType.findFirst({ where: { workspaceId, isDefault: true } })) ??
    (await prisma.taskType.create({ data: { workspaceId, name: DEFAULT_TYPE_NAME.ru, isDefault: true } }));
  const template = templateCreateData(type.id);
  await prisma.template.deleteMany({ where: { workspaceId, name: { in: defaultTemplateNames() } } });
  await prisma.template.create({ data: { ...template, workspaceId } });
  console.log(`Seeded ${email} (workspace "${workspaceName}") with template "${template.name}"`);
}

async function main() {
  // Optional local test admins for UI checks (TEST_USER_* in .env). The second
  // one lives in a different workspace — handy for checking tenant isolation.
  const { TEST_USER_EMAIL, TEST_USER_PASSWORD, TEST_USER2_EMAIL, TEST_USER2_PASSWORD } = process.env;
  if (TEST_USER_EMAIL && TEST_USER_PASSWORD) await seedAdmin(TEST_USER_EMAIL, TEST_USER_PASSWORD, "Тестовый дизайнер", "Тестовая компания");
  if (TEST_USER2_EMAIL && TEST_USER2_PASSWORD) await seedAdmin(TEST_USER2_EMAIL, TEST_USER2_PASSWORD, "Второй дизайнер", "Вторая компания");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
