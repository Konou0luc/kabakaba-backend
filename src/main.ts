import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { getAbsoluteFSPath } from 'swagger-ui-dist';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

export function resolveSwaggerAssetPath(requestPath: string, swaggerUiDir: string) {
  const normalizedPath = requestPath.replace(/^\/docs\/?/, '').replace(/^\//, '');

  if (!normalizedPath || !normalizedPath.includes('.')) {
    return null;
  }

  const candidates = normalizedPath === 'swagger-ui.css' ? ['swagger-ui.css', 'index.css'] : [normalizedPath];

  for (const candidate of candidates) {
    const candidatePath = path.join(swaggerUiDir, candidate);
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return path.join(swaggerUiDir, normalizedPath);
}

function buildSwaggerHtml(swaggerUrl: string) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Swagger UI</title>
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='16' fill='%230f172a'/%3E%3Cpath d='M30 25h40v10H40v10h24v10H40v10h30v10H30z' fill='%23ffffff'/%3E%3C/svg%3E" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.6/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.6/swagger-ui-bundle.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.6/swagger-ui-standalone-preset.js"></script>
    <script>
      window.onload = function () {
        window.ui = SwaggerUIBundle({
          url: '${swaggerUrl}',
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
          layout: 'BaseLayout',
        });
      };
    </script>
  </body>
</html>`;
}

export async function createNestApp() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [
      'http://localhost:5173',
     // 'https://<ton-domaine-frontend-de-prod>', // remplace par la vraie URL une fois le frontend déployé
    ],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalFilters(new AllExceptionsFilter());

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const swaggerUiDir = getAbsoluteFSPath();
  const swaggerAssetPath = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const filePath = resolveSwaggerAssetPath(req.path, swaggerUiDir);

    if (!filePath) {
      next();
      return;
    }

    if (!fs.existsSync(filePath)) {
      res.status(404).send('Not Found');
      return;
    }

    res.sendFile(filePath, (err) => {
      if (err) {
        next(err);
      }
    });
  };

  app.use('/docs', express.static(swaggerUiDir, { fallthrough: true }));
  app.use('/docs', swaggerAssetPath);

  const config = new DocumentBuilder()
    .setTitle('Kabakaba API')
    .setDescription('The Kabakaba platform API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  const swaggerJsonPath = '/api/v1/docs-json';

  const httpAdapter = app.getHttpAdapter();
  const expressInstance = httpAdapter.getInstance() as express.Express;

  expressInstance.get('/docs', (_req, res) => {
    res.type('html').send(buildSwaggerHtml(swaggerJsonPath));
  });

  expressInstance.get('/docs/', (_req, res) => {
    res.type('html').send(buildSwaggerHtml(swaggerJsonPath));
  });

  expressInstance.get('/api/v1/docs-json', (_req, res) => {
    res.json(document);
  });

  if (process.env.VERCEL || process.env.NEST_SERVERLESS === 'true') {
    await app.init();
  }

  return app;
}

async function bootstrap() {
  const app = await createNestApp();
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}/api/v1`);
  console.log(`Swagger documentation available at: http://localhost:${port}/docs`);
}

if (require.main === module) {
  bootstrap();
}
