import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

// A generic project template. Idempotent: re-running replaces it by name.
const TEMPLATE = {
  name: "Типовой проект",
  columns: ["Бэклог", "В работе", "На проверке", "Готово"],
  cards: [
    { title: "Бриф и требования", type: "SETUP" as const, estimateHours: 3, checklist: ["Встреча с клиентом", "Цели и критерии успеха", "Ограничения и сроки"] },
    { title: "План работ и оценка", type: "SETUP" as const, estimateHours: 4, checklist: ["Состав работ", "Оценка по часам", "Согласовать с клиентом"] },
    { title: "Реализация", type: "WIDGET" as const, estimateHours: 16, checklist: [] },
    { title: "Интеграции с сервисами клиента", type: "INTEGRATION" as const, estimateHours: 6, checklist: [] },
    { title: "Тестирование", type: "OTHER" as const, estimateHours: 4, checklist: ["Проверка по требованиям", "Исправление ошибок"] },
    { title: "Обучение пользователей", type: "TRAINING" as const, estimateHours: 3, checklist: ["Инструкция", "Обучающая встреча"] },
    { title: "Сдача и закрытие", type: "OTHER" as const, estimateHours: 1, checklist: ["Акт", "Обратная связь"] },
  ],
};

// Older seeded template that was tied to one CRM vendor.
const LEGACY_TEMPLATES = ["Стандартное внедрение amoCRM"];

async function main() {
  await prisma.template.deleteMany({ where: { name: { in: [TEMPLATE.name, ...LEGACY_TEMPLATES] } } });
  await prisma.template.create({
    data: {
      name: TEMPLATE.name,
      columns: TEMPLATE.columns,
      cards: { create: TEMPLATE.cards.map((c, i) => ({ ...c, position: i + 1 })) },
    },
  });
  console.log(`Seeded template "${TEMPLATE.name}"`);

  // Optional local test admin for UI checks (TEST_USER_* in .env).
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (email && password) {
    await prisma.user.upsert({
      where: { email },
      update: { passwordHash: await bcrypt.hash(password, 10), isActive: true, role: "ADMIN" },
      create: { email, name: "Тестовый дизайнер", role: "ADMIN", passwordHash: await bcrypt.hash(password, 10) },
    });
    console.log(`Seeded test user ${email}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
