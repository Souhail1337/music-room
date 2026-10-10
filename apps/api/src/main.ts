import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

async function bootstrap() {
  const app = configureApp(await NestFactory.create(AppModule));
  await app.listen(process.env.PORT ?? process.env.API_PORT ?? 3000, '0.0.0.0');
}
await bootstrap();
