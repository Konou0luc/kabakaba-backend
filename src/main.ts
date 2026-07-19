import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import * as path from 'path';
import { getAbsoluteFSPath } from 'swagger-ui-dist';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

export async function createNestApp() {
  const app = await NestFactory.create(AppModule);

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
    const assetPath = req.path.replace(/^\//, '');
    if (!assetPath || !assetPath.includes('.')) {
      next();
      return;
    }

    const filePath = path.join(swaggerUiDir, assetPath);
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
  SwaggerModule.setup('docs', app, document);

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
