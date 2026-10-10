import { Injectable } from '@nestjs/common';
import { Prisma, User } from '../generated/prisma/client.js';
import { Errors } from '../common/errors/app-error.js';
import { UsersRepository } from './users.repository.js';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  findById(id: string): Promise<User | null> {
    return this.users.findById(id);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findByEmail(normalizeEmail(email));
  }

  findByGoogleSub(sub: string): Promise<User | null> {
    return this.users.findByGoogleSub(sub);
  }

  async createWithPassword(input: {
    email: string;
    displayName: string;
    passwordHash: string;
  }): Promise<User> {
    try {
      return await this.users.create({
        email: normalizeEmail(input.email),
        displayName: input.displayName.trim(),
        passwordHash: input.passwordHash,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw Errors.emailTaken();
      }
      throw error;
    }
  }

  async createFromGoogle(input: {
    email: string;
    displayName: string;
    googleSub: string;
  }): Promise<User> {
    try {
      return await this.users.create({
        email: normalizeEmail(input.email),
        displayName: input.displayName.trim().slice(0, 40) || 'Music lover',
        googleSub: input.googleSub,
        emailVerifiedAt: new Date(),
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw Errors.accountExists();
      }
      throw error;
    }
  }

  /** FR-11 invite search: display-name prefix or exact email, ≤ 20, never the caller. */
  search(
    q: string,
    excludeId: string,
  ): Promise<{ id: string; displayName: string }[]> {
    const text = q.trim();
    return this.users.search(text, normalizeEmail(text), excludeId, 20);
  }

  markEmailVerified(id: string): Promise<User> {
    return this.users.update(id, { emailVerifiedAt: new Date() });
  }

  setPasswordHash(
    id: string,
    passwordHash: string,
    verifyEmail: boolean,
  ): Promise<User> {
    return this.users.update(id, {
      passwordHash,
      ...(verifyEmail ? { emailVerifiedAt: new Date() } : {}),
    });
  }
}
