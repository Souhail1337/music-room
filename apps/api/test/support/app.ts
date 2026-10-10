import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import {
  GoogleIdentity,
  GoogleVerifierService,
} from '../../src/auth/google-verifier.service.js';
import { MailService, OutgoingMail } from '../../src/auth/mail.service.js';
import { PrismaService } from '../../src/common/prisma/prisma.service.js';
import { ActionLogService } from '../../src/logs/action-log.service.js';

/** Captures mail instead of sending it, so tests can follow the links. */
export class CapturingMail extends MailService {
  readonly sent: OutgoingMail[] = [];
  override async send(mail: OutgoingMail): Promise<void> {
    this.sent.push(mail);
  }
  lastLinkTo(email: string, path: '/auth/verify' | '/auth/reset'): string {
    const mail = [...this.sent]
      .reverse()
      .find((m) => m.to === email && m.text.includes(path));
    if (!mail) throw new Error(`No ${path} mail for ${email}`);
    const match = mail.text.match(/https?:\/\/\S+/);
    return new URL(match![0]).searchParams.get('token')!;
  }
}

/** Google ID-token verification is mocked: tokens look like `valid|<sub>|<email>|<name>`. */
export class FakeGoogleVerifier {
  configured = true;
  isConfigured(): boolean {
    return this.configured;
  }
  async verify(idToken: string): Promise<GoogleIdentity | null> {
    const [tag, sub, email, name] = idToken.split('|');
    return tag === 'valid' && sub && email
      ? { sub, email, name: name ?? 'G' }
      : null;
  }
}

export interface TestApp {
  app: INestApplication;
  mail: CapturingMail;
  google: FakeGoogleVerifier;
  prisma: PrismaService;
  logs: ActionLogService;
}

export async function createTestApp(): Promise<TestApp> {
  const google = new FakeGoogleVerifier();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useClass(CapturingMail)
    .overrideProvider(GoogleVerifierService)
    .useValue(google)
    .compile();
  const app = configureApp(moduleRef.createNestApplication());
  await app.init();
  return {
    app,
    mail: app.get(MailService) as CapturingMail,
    google,
    prisma: app.get(PrismaService),
    logs: app.get(ActionLogService),
  };
}
