// Local dev Postgres — no Docker/Homebrew required. Spawns a real Postgres
// cluster from downloaded binaries (see the `embedded-postgres` package) into
// apps/api/.pgdata, matching the DATABASE_URL in .env.example.
import EmbeddedPostgres from "embedded-postgres";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dataDir = path.join(__dirname, "..", ".pgdata");

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "kanban",
  password: "kanban",
  port: 5433,
  persistent: true,
  // initdb refuses to run as root (cloud sandboxes, containers): let the
  // package create an unprivileged "postgres" user to run the server.
  createPostgresUser: process.getuid?.() === 0,
});

async function up() {
  // initdb refuses a non-empty data dir, so only initialise on the first run.
  if (!fs.existsSync(path.join(dataDir, "PG_VERSION"))) {
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase("kanban");
  } catch {
    // database already exists — fine on subsequent runs
  }
  console.log("Postgres is up on localhost:5433 (db: kanban)");
}

async function down() {
  await pg.stop();
  console.log("Postgres stopped");
}

if (process.argv[2] === "down") {
  down().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  up().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
