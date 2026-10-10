import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
}

/** Verifies Google ID tokens on the server (AD-6). The app never sends Google user data itself. */
@Injectable()
export class GoogleVerifierService {
  private readonly audience: string[];
  private readonly client = new OAuth2Client();

  constructor(config: ConfigService) {
    this.audience = (config.get<string>('GOOGLE_WEB_CLIENT_ID') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }

  isConfigured(): boolean {
    return this.audience.length > 0;
  }

  /** Returns the identity, or null if the token is invalid, expired, for another audience or unverified. */
  async verify(idToken: string): Promise<GoogleIdentity | null> {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.audience,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email || payload.email_verified !== true)
        return null;
      return {
        sub: payload.sub,
        email: payload.email,
        name: payload.name ?? payload.email.split('@')[0],
      };
    } catch {
      return null;
    }
  }
}
