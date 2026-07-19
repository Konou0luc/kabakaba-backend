jest.mock('./app.module', () => ({
  AppModule: class AppModule {},
}));

jest.mock('./common/filters/http-exception.filter', () => ({
  AllExceptionsFilter: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn(),
  },
}));

jest.mock('@nestjs/swagger', () => ({
  DocumentBuilder: jest.fn().mockImplementation(() => ({
    setTitle: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    setVersion: jest.fn().mockReturnThis(),
    addBearerAuth: jest.fn().mockReturnThis(),
    build: jest.fn().mockReturnThis(),
  })),
  SwaggerModule: {
    createDocument: jest.fn().mockReturnValue({}),
    setup: jest.fn(),
  },
}));

import { resolveSwaggerAssetPath } from './main';

describe('main bootstrap', () => {
  it('should not start listening when imported as a module', async () => {
    const listen = jest.fn().mockResolvedValue(undefined);
    const mockApp = {
      useGlobalFilters: jest.fn(),
      setGlobalPrefix: jest.fn(),
      useGlobalPipes: jest.fn(),
      listen,
      getHttpAdapter: jest.fn().mockReturnValue({
        getInstance: jest.fn().mockReturnValue(() => undefined),
      }),
    };

    const { NestFactory } = jest.requireMock('@nestjs/core') as {
      NestFactory: { create: jest.Mock };
    };
    NestFactory.create.mockResolvedValue(mockApp);

    jest.resetModules();
    const mainModule = await require('./main');
    expect(mainModule).toBeDefined();
    expect(listen).not.toHaveBeenCalled();
  });

  it('maps docs asset requests to the Swagger UI directory', () => {
    expect(resolveSwaggerAssetPath('/docs/swagger-ui.css', '/tmp/swagger-ui')).toBe('/tmp/swagger-ui/swagger-ui.css');
    expect(resolveSwaggerAssetPath('/docs/swagger-ui-bundle.js', '/tmp/swagger-ui')).toBe('/tmp/swagger-ui/swagger-ui-bundle.js');
    expect(resolveSwaggerAssetPath('/docs/', '/tmp/swagger-ui')).toBeNull();
  });

  it('falls back to the packaged index.css for swagger-ui.css when needed', () => {
    const tempDir = '/tmp/swagger-ui';
    const fallbackPath = '/tmp/swagger-ui/index.css';
    const originalExistsSync = require('fs').existsSync;

    jest.spyOn(require('fs'), 'existsSync').mockImplementation((candidatePath: unknown) => {
      if (candidatePath === '/tmp/swagger-ui/swagger-ui.css') {
        return false;
      }
      if (candidatePath === '/tmp/swagger-ui/index.css') {
        return true;
      }
      return originalExistsSync(candidatePath as string);
    });

    expect(resolveSwaggerAssetPath('/docs/swagger-ui.css', tempDir)).toBe(fallbackPath);
    jest.restoreAllMocks();
  });
});
