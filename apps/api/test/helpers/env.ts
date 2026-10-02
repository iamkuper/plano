// Runs in every test process before any module is loaded.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://kanban:kanban@localhost:5433/kanban_test?schema=public";
process.env.JWT_SECRET = "test-secret";
process.env.DISABLE_SCHEDULERS = "1";
process.env.APP_URL = "http://localhost:3100";
process.env.UPLOAD_DIR = require("path").join(require("os").tmpdir(), "plano-test-uploads");
// The real terminal (if configured in .env) must never be called from tests.
process.env.TBANK_TERMINAL_KEY = "";
process.env.TBANK_PASSWORD = "";
process.env.SMTP_HOST = "";
process.env.PLATFORM_ADMIN_EMAILS = "platform-owner@iso.test";
