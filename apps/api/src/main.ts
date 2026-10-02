import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { json } from "express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  // Avatars are sent as data: URLs (≈30–200 KB after client-side resize).
  app.use(json({ limit: "2mb" }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = process.env.PORT ?? 3101;
  await app.listen(port);
  console.log(`Kanban API listening on http://localhost:${port}`);
}
bootstrap();
