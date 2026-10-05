import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";

// Creates the benchmark database if needed and migrates it. Unlike the tests it
// keeps the data: filling it takes minutes (BENCH_RESET=1 starts over).
export default async function globalSetup() {
  const url = process.env.BENCH_DATABASE_URL ?? "postgresql://kanban:kanban@localhost:5433/kanban_bench?schema=public";
  const name = new URL(url).pathname.slice(1);
  const admin = new PrismaClient({ datasources: { db: { url: url.replace(`/${name}`, "/postgres") } } });
  try {
    const rows = await admin.$queryRawUnsafe<{ datname: string }[]>(`SELECT datname FROM pg_database WHERE datname = '${name}'`);
    if (!rows.length) await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.$disconnect();
  }
  execSync("pnpm exec prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  if (process.env.BENCH_RESET === "1") {
    const db = new PrismaClient({ datasources: { db: { url } } });
    try {
      await db.$executeRawUnsafe('TRUNCATE "Workspace" CASCADE');
    } finally {
      await db.$disconnect();
    }
  }
}
