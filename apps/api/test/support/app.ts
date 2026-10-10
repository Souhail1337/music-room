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
import {
  DeezerClient,
  DeezerTrack,
  DeezerUnavailableError,
} from '../../src/music/deezer.client.js';

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

/** A tiny in-memory Deezer catalog. `down = true` makes every call fail like a Deezer outage. */
export class FakeDeezer {
  down = false;
  searchCalls = 0;
  trackCalls = 0;
  readonly catalog = new Map<string, Omit<DeezerTrack, 'previewUrl'>>();

  constructor() {
    for (let i = 1; i <= 40; i++) {
      const id = String(3135550 + i);
      this.catalog.set(id, {
        id,
        title: i === 6 ? 'One More Time' : `Track ${i}`,
        artist: i % 2 ? 'Daft Punk' : 'Justice',
        artworkUrl: `https://cdn.example/cover/${id}.jpg`,
        durationSec: 200 + i,
      });
    }
  }

  async search(q: string, limit = 25): Promise<DeezerTrack[]> {
    if (this.down) throw new DeezerUnavailableError();
    this.searchCalls++;
    const needle = q.toLowerCase();
    return [...this.catalog.values()]
      .filter((t) =>
        `${t.title} ${t.artist}`.toLowerCase().includes(needle.split(' ')[0]),
      )
      .slice(0, limit)
      .map((t) => this.withPreview(t));
  }

  async getTrack(id: string): Promise<DeezerTrack | null> {
    if (this.down) throw new DeezerUnavailableError();
    this.trackCalls++;
    const track = this.catalog.get(id);
    return track ? this.withPreview(track) : null;
  }

  private withPreview(t: Omit<DeezerTrack, 'previewUrl'>): DeezerTrack {
    return {
      ...t,
      previewUrl: `https://cdn.example/preview/${t.id}.mp3?hdnea=${this.trackCalls}`,
    };
  }
}

export interface TestApp {
  app: INestApplication;
  mail: CapturingMail;
  google: FakeGoogleVerifier;
  prisma: PrismaService;
  logs: ActionLogService;
  deezer: FakeDeezer;
  /** Base URL when started with `{ listen: true }` (needed for Socket.IO clients). */
  url: string;
}

export async function createTestApp(
  options: { listen?: boolean } = {},
): Promise<TestApp> {
  const google = new FakeGoogleVerifier();
  const deezer = new FakeDeezer();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useClass(CapturingMail)
    .overrideProvider(GoogleVerifierService)
    .useValue(google)
    .overrideProvider(DeezerClient)
    .useValue(deezer)
    .compile();
  const app = configureApp(moduleRef.createNestApplication());
  let url = '';
  if (options.listen) {
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
    url = url.replace('[::1]', '127.0.0.1');
  } else {
    await app.init();
  }
  return {
    deezer,
    url,
    app,
    mail: app.get(MailService) as CapturingMail,
    google,
    prisma: app.get(PrismaService),
    logs: app.get(ActionLogService),
  };
}
