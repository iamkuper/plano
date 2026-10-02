# Plano — заметки для Claude

- Монорепо pnpm: `apps/api` (NestJS + Prisma), `apps/web` (Next 14 + Tailwind), `packages/shared`.
- После правок в `packages/shared/src` пересобрать: `pnpm --filter @amo-kanban/shared build`, иначе api/web не увидят изменений.
- Проверка типов: `npx tsc --noEmit -p apps/api` и `npx tsc --noEmit -p apps/web`.
- Миграции: `prisma migrate dev` интерактивный и в неинтерактивной среде не работает. Создавать SQL через
  `prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script`
  в новую папку `prisma/migrations/<timestamp>_<name>/migration.sql`, затем `prisma migrate deploy`.
- Окружение с нуля: `./scripts/cloud-setup.sh`.
- Права: новые действия добавлять в `PERMISSIONS` (shared), на сервере — `@RequirePermission(...)` + `PermissionGuard`, в вебе — `useCan()`.
- UI: эталон Linear, профиль дизайна — `.ux-profile.md`. Цвета только через токены `apps/web/src/design/tokens.ts` (акцент и меню #2B2F33). Тексты интерфейса на русском, сухой тон.
- Проверять интерфейс в браузере и скриншотами можно.
- В облаке (Claude Code on the web) окружение готовит хук SessionStart из `.claude/settings.json`: он запускает `scripts/cloud-setup.sh`, лог — `/tmp/plano-setup.log`. Если база или зависимости не поднялись, посмотреть лог и запустить скрипт вручную.
- Мультитенантность: сервисы получают `PrismaService` (скоуп по рабочему пространству, `src/prisma/tenant.ts`). Новая модель — добавить в `SCOPE` (и в `PARENTS`, если есть внешние ключи). Создавая запись User/Project/Card/Template/Role, подмешивать `OWN_FIELDS`/`CARD_FIELDS`. `SystemPrismaService` — только для логина, планировщика и подписанных ссылок. После изменений в доступе к данным: `node apps/api/test/isolation.mjs` на запущенном API.
