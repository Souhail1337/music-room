import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { GoogleVerifierService } from './google-verifier.service.js';

function verifierWith(payload: Record<string, unknown> | Error) {
  const verifyIdToken = vi
    .spyOn(OAuth2Client.prototype, 'verifyIdToken')
    .mockImplementation((() =>
      payload instanceof Error
        ? Promise.reject(payload)
        : Promise.resolve({ getPayload: () => payload })) as never);
  const service = new GoogleVerifierService(
    new ConfigService({ GOOGLE_WEB_CLIENT_ID: ' web-id , android-id ,' }),
  );
  return { service, verifyIdToken };
}

describe('GoogleVerifierService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is not configured without client IDs', () => {
    expect(new GoogleVerifierService(new ConfigService({})).isConfigured()).toBe(
      false,
    );
  });

  it('checks the token against every configured client ID', async () => {
    const { service, verifyIdToken } = verifierWith({
      sub: '42',
      email: 'ana@example.com',
      email_verified: true,
      name: 'Ana',
    });
    expect(service.isConfigured()).toBe(true);
    await expect(service.verify('id-token')).resolves.toEqual({
      sub: '42',
      email: 'ana@example.com',
      name: 'Ana',
    });
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'id-token',
      audience: ['web-id', 'android-id'],
    });
  });

  it('falls back to the email local part when Google sends no name', async () => {
    const { service } = verifierWith({
      sub: '42',
      email: 'ana@example.com',
      email_verified: true,
    });
    await expect(service.verify('id-token')).resolves.toMatchObject({
      name: 'ana',
    });
  });

  it('refuses an unverified Google email', async () => {
    const { service } = verifierWith({
      sub: '42',
      email: 'ana@example.com',
      email_verified: false,
    });
    await expect(service.verify('id-token')).resolves.toBeNull();
  });

  it('refuses a token Google rejects (bad signature, audience or expiry)', async () => {
    const { service } = verifierWith(new Error('Wrong recipient'));
    await expect(service.verify('id-token')).resolves.toBeNull();
  });
});
