import { INestApplication, ValidationPipe } from "@nestjs/common";
import { json } from "express";
import { PrismaExceptionFilter } from "./prisma/prisma-exception.filter";

// Everything main.ts configures on the app, shared with the tests so they run
// the same pipeline as production.
export function configureApp(app: INestApplication) {
  app.enableCors();
  // Avatars are sent as data: URLs (≈30–200 KB after client-side resize).
  app.use(json({ limit: "2mb" }));
  app.useGlobalFilters(new PrismaExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  return app;
}
