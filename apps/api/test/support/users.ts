import request from 'supertest';
import type { TestApp } from './app.js';

let seq = 0;

export interface TestUser {
  id: string;
  email: string;
  displayName: string;
  token: string;
}

/** Signs up through the API, then marks the email verified directly (the link flow is covered by auth tests). */
export async function verifiedUser(
  t: TestApp,
  displayName = 'User',
): Promise<TestUser> {
  const email = `${displayName.toLowerCase().replace(/\W+/g, '')}.${Date.now()}.${++seq}@example.com`;
  const res = await request(t.app.getHttpServer())
    .post('/auth/signup')
    .send({ email, password: 'correct horse battery', displayName })
    .expect(201);
  await t.prisma.user.update({
    where: { id: res.body.user.id },
    data: { emailVerifiedAt: new Date() },
  });
  return {
    id: res.body.user.id,
    email,
    displayName,
    token: res.body.accessToken,
  };
}

export const bearer = (user: { token: string }) => ({
  Authorization: `Bearer ${user.token}`,
});
