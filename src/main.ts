import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import helmet from 'helmet';
import { getAbsoluteFSPath } from 'swagger-ui-dist';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

/**
 * En production, /docs et /docs-json exposent la structure complète de
 * l'API (routes, DTOs, rôles requis) à quiconque connaît l'URL : c'est de
 * la reconnaissance offerte gratuitement à un attaquant (OWASP API9:2023,
 * gestion d'inventaire). On les protège par Basic Auth uniquement quand
 * l'app tourne en production ; en dev/local, la doc reste ouverte pour ne
 * pas gêner le travail quotidien.
 *
 * Fail-closed : si SWAGGER_USER/SWAGGER_PASSWORD ne sont pas configurés en
 * production, l'accès est refusé plutôt que laissé ouvert par défaut.
 */
function isProductionEnv() {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireSwaggerAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  if (!isProductionEnv()) return next();

  const expectedUser = process.env.SWAGGER_USER;
  const expectedPassword = process.env.SWAGGER_PASSWORD;

  const reject = () => {
    res.set('WWW-Authenticate', 'Basic realm="Kabakaba API docs"');
    res.status(401).send('Authentification requise');
  };

  if (!expectedUser || !expectedPassword) {
    // Pas de credentials configurés en prod : on refuse plutôt que d'exposer.
    res.status(403).send('Documentation désactivée');
    return;
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Basic ')) {
    reject();
    return;
  }

  const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) {
    reject();
    return;
  }

  const user = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  if (!timingSafeStringEqual(user, expectedUser) || !timingSafeStringEqual(password, expectedPassword)) {
    reject();
    return;
  }

  next();
}

export function resolveSwaggerAssetPath(requestPath: string, swaggerUiDir: string) {
  const normalizedPath = requestPath.replace(/^\/docs\/?/, '').replace(/^\//, '');

  if (!normalizedPath || !normalizedPath.includes('.')) {
    return null;
  }

  const candidates = normalizedPath === 'swagger-ui.css' ? ['swagger-ui.css', 'index.css'] : [normalizedPath];
  const root = path.resolve(swaggerUiDir);

  for (const candidate of candidates) {
    const resolved = path.resolve(root, candidate);

    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      continue;
    }

    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }

  return null;
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
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.enableCors({
    origin: [
      'http://localhost:5173',
      'https://kabakaba-frontend.vercel.app',
      'https://ka-bakaba.vercel.app',
    ],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

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
      res.status(404).send('Not Found');
      return;
    }

    res.sendFile(filePath, (err) => {
      if (err) {
        next(err);
      }
    });
  };

  app.use('/docs', requireSwaggerAuth, express.static(swaggerUiDir, { fallthrough: true }));
  app.use('/docs', requireSwaggerAuth, swaggerAssetPath);

  const swaggerJsonPath = '/api/v1/docs-json';

  // Génération PARESSEUSE : SwaggerModule.createDocument() scanne tous les
  // contrôleurs/DTOs/entités de l'app (coûteux, ~centaines de ms à quelques
  // secondes). En serverless, ce coût était payé à CHAQUE cold start même
  // quand personne ne consulte /docs. On ne le calcule donc qu'à la première
  // requête réelle sur /docs-json, puis on le met en cache en mémoire.
  let cachedSwaggerDocument: ReturnType<typeof SwaggerModule.createDocument> | null = null;
  function getSwaggerDocument() {
    if (!cachedSwaggerDocument) {
      const config = new DocumentBuilder()
        .setTitle('Kabakaba API')
        .setDescription('The Kabakaba platform API documentation')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
      cachedSwaggerDocument = SwaggerModule.createDocument(app, config);
    }
    return cachedSwaggerDocument;
  }

  const httpAdapter = app.getHttpAdapter();
  const expressInstance = httpAdapter.getInstance() as express.Express;

  expressInstance.get('/docs', requireSwaggerAuth, (_req, res) => {
    res.type('html').send(buildSwaggerHtml(swaggerJsonPath));
  });

  expressInstance.get('/docs/', requireSwaggerAuth, (_req, res) => {
    res.type('html').send(buildSwaggerHtml(swaggerJsonPath));
  });

  expressInstance.get('/api/v1/docs-json', requireSwaggerAuth, (_req, res) => {
    res.json(getSwaggerDocument());
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