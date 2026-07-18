import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';

async function bootstrap() {
  const port = parseInt(process.env.PORT || '3001', 10);

  const app = await NestFactory.create(AppModule);

  // CORS cho Next.js client
  app.enableCors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  // Register global exception filter
  app.useGlobalFilters(new AllExceptionsFilter(app.getHttpAdapter()));

  await app.listen(port);
  console.log(`[MiniChat Server] Running on port ${port}`);
}
bootstrap();
