import 'reflect-metadata';
import './load-env';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import express, { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { getEnvOr } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });

  const allowedOrigins = getEnvOr('ALLOWED_ORIGINS', 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim());
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: undefined, // reflect the requested headers, like allow_headers=["*"]
    optionsSuccessStatus: 200, // Starlette answers preflights with 200
  });

  // JSON bodies (FastAPI had no size limit; keep a generous one).
  app.use(express.json({ limit: '50mb' }));
  // Malformed JSON -> FastAPI's 422 "json_invalid".
  app.use((error: { type?: string; message?: string }, _req: Request, res: Response, next: NextFunction) => {
    if (error?.type === 'entity.parse.failed') {
      // FastAPI puts the character offset of the decode error in `loc`.
      const position = Number(/position (\d+)/.exec(error.message ?? '')?.[1] ?? 0);
      res.status(422).json({
        detail: [
          {
            type: 'json_invalid',
            loc: ['body', position],
            msg: 'JSON decode error',
            input: {},
            ctx: { error: error.message ?? 'Expecting value' },
          },
        ],
      });
      return;
    }
    next(error);
  });

  app.disable('x-powered-by');
  app.enableShutdownHooks();

  const port = Number(getEnvOr('PORT', '8000'));
  await app.listen(port);
}

void bootstrap();
