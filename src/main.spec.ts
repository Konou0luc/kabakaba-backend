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
});
