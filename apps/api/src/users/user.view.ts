import { ApiProperty } from '@nestjs/swagger';
import type { User } from '../generated/prisma/client.js';

/** The only shape a user leaves the API in (spec A: self view; spec D adds ProfileView privacy levels). */
export class MeView {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'yasmine@example.com' })
  email: string;

  @ApiProperty({ example: 'Yasmine' })
  displayName: string;

  @ApiProperty()
  emailVerified: boolean;

  @ApiProperty({ description: 'A Google account is linked.' })
  hasGoogle: boolean;

  @ApiProperty({ description: 'The account can log in with a password.' })
  hasPassword: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  static of(user: User): MeView {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      emailVerified: user.emailVerifiedAt !== null,
      hasGoogle: user.googleSub !== null,
      hasPassword: user.passwordHash !== null,
      createdAt: user.createdAt.toISOString(),
    };
  }
}

/** The only user fields other people may see in search results. */
export class UserSummary {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Sam' })
  displayName: string;
}

export class UserSummaryList {
  @ApiProperty({ type: [UserSummary] })
  items: UserSummary[];
}
