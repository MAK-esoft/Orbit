import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  // Disable the built-in body parser so we can raise the JSON limit — the
  // workflow ingest endpoint receives base64 proof images that exceed the
  // default 100kb. (Multipart uploads are handled by Multer, not this parser.)
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);

  app.use(json({ limit: '25mb' }));
  app.use(urlencoded({ extended: true, limit: '25mb' }));

  app.setGlobalPrefix('api');
  app.use(cookieParser());

  app.enableCors({
    origin: config.get<string>('frontendUrl'),
    credentials: true, // allow HTTP-only auth cookies
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = config.getOrThrow<number>('port');
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Orbit API running on http://localhost:${port}/api`);
}

bootstrap();
