# Production images for the API and the web app (one monorepo build, two
# targets). Build with deploy/docker-compose.yml.
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /app
COPY . .
# postinstall builds packages/shared; native modules (bcrypt, prisma) build here.
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @plano/api exec prisma generate && pnpm --filter @plano/api build

# Public settings are baked into the web bundle at build time.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_SUPPORT_TELEGRAM
ARG NEXT_PUBLIC_SUPPORT_WHATSAPP
ARG NEXT_PUBLIC_SUPPORT_EMAIL
ARG NEXT_PUBLIC_YM_ID
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @plano/web build

FROM build AS api
ENV NODE_ENV=production
WORKDIR /app/apps/api
EXPOSE 3101
# Apply pending migrations, then start.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]

FROM build AS web
ENV NODE_ENV=production
WORKDIR /app/apps/web
EXPOSE 3100
CMD ["npx", "next", "start", "-p", "3100", "-H", "0.0.0.0"]
