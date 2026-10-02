// Creates/migrates/empties the E2E database. Runs from apps/api before the API starts.
import { execSync } from "child_process";
import { createRequire } from "module";

const url = process.env.DATABASE_URL;
const name = new URL(url).pathname.slice(1);
const { PrismaClient } = createRequire(import.meta.url)(process.cwd() + "/node_modules/@prisma/client");

const admin = new PrismaClient({ datasources: { db: { url: url.replace(`/${name}`, "/postgres") } } });
const rows = await admin.$queryRawUnsafe(`SELECT datname FROM pg_database WHERE datname = '${name}'`);
if (!rows.length) await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
await admin.$disconnect();

execSync("pnpm exec prisma migrate deploy", { stdio: "inherit" });

const db = new PrismaClient();
await db.$executeRawUnsafe('TRUNCATE "Workspace" CASCADE');
await db.$disconnect();
