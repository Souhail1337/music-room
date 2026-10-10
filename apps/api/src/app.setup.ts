import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Shared by main.ts and the e2e tests so both run the exact same app. */
export function configureApp(app: INestApplication): INestApplication {
  app.enableShutdownHooks();
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Music Room API')
      .setDescription(
        'REST API of Music Room. Errors always use `{ code, message, details? }`. ' +
          'Send `X-Platform`, `X-Device` and `X-App-Version` on every request (action log).',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .addGlobalParameters(
        {
          in: 'header',
          name: 'X-Platform',
          required: false,
          schema: { type: 'string', example: 'android' },
        },
        {
          in: 'header',
          name: 'X-Device',
          required: false,
          schema: { type: 'string', example: 'Pixel 8' },
        },
        {
          in: 'header',
          name: 'X-App-Version',
          required: false,
          schema: { type: 'string', example: '1.0.0' },
        },
      )
      .build(),
  );
  SwaggerModule.setup('docs', app, document);
  return app;
}
