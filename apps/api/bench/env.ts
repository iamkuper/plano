process.env.DATABASE_URL = process.env.BENCH_DATABASE_URL ?? "postgresql://kanban:kanban@localhost:5433/kanban_bench?schema=public";
process.env.JWT_SECRET = "bench-secret";
process.env.DISABLE_SCHEDULERS = "1";
process.env.APP_URL = "http://localhost:3100";
process.env.TBANK_TERMINAL_KEY = "";
process.env.SMTP_HOST = "";
process.env.AGENT_SECRET_KEY = "bench-agent-secret";
process.env.PRISMA_QUERY_LOG = "1";
