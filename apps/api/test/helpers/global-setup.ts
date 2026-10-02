import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";

// Creates the test database if needed and brings it to the latest migration.
export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://kanban:kanban@localhost:5433/kanban_test?schema=public";
  const name = new URL(url).pathname.slice(1);
  const admin = new PrismaClient({ datasources: { db: { url: url.replace(`/${name}`, "/postgres") } } });
  try {
    const rows = await admin.$queryRawUnsafe<{ datname: string }[]>(`SELECT datname FROM pg_database WHERE datname = '${name}'`);
    if (!rows.length) await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.$disconnect();
  }
  execSync("pnpm exec prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });

  // A clean slate for every run (the plan catalogue stays): everything else
  // hangs off Workspace, so one cascading truncate empties it.
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    await db.$executeRawUnsafe('TRUNCATE "Workspace" CASCADE');
  } finally {
    await db.$disconnect();
  }
}
