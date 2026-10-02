import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";

async function bootstrap() {
  const app = configureApp(await NestFactory.create(AppModule));
  const port = process.env.PORT ?? 3101;
  await app.listen(port);
  console.log(`Kanban API listening on http://localhost:${port}`);
}
bootstrap();
