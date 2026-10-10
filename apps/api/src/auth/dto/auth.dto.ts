import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MeView } from '../../users/user.view.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class SignupDto {
  @ApiProperty({ example: 'yasmine@example.com' })
  @Transform(trim)
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(254)
  email: string;

  @ApiProperty({
    minLength: 8,
    maxLength: 128,
    example: 'correct horse battery',
  })
  @IsString()
  @MinLength(8, { message: 'Use at least 8 characters.' })
  @MaxLength(128)
  password: string;

  @ApiProperty({ minLength: 1, maxLength: 40, example: 'Yasmine' })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Enter a display name.' })
  @MaxLength(40)
  displayName: string;
}

export class LoginDto {
  @ApiProperty({ example: 'yasmine@example.com' })
  @Transform(trim)
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(254)
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}

export class GoogleLoginDto {
  @ApiProperty({
    description: 'Google ID token obtained by the app; verified by the server.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  idToken: string;
}

export class RefreshDto {
  @ApiProperty({
    description: 'The opaque refresh token from the last login or refresh.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  refreshToken: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'yasmine@example.com' })
  @Transform(trim)
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(254)
  email: string;
}

export class TokenQueryDto {
  @ApiPropertyOptional({ description: 'Single-use token from the email link.' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  token?: string;
}

/** Posted by the HTML reset page (form-urlencoded). Length is checked by the service so errors render as HTML. */
export class ResetPasswordFormDto {
  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MaxLength(512)
  password: string;

  @ApiProperty({ description: 'Must equal password.' })
  @IsString()
  @MaxLength(512)
  confirm: string;
}

export class AuthResponse {
  @ApiProperty({ type: MeView })
  user: MeView;

  @ApiProperty({
    description:
      'JWT (`sub`, `sid`), valid 15 minutes. Send as `Authorization: Bearer`.',
  })
  accessToken: string;

  @ApiProperty({ example: 900 })
  accessTokenExpiresIn: number;

  @ApiProperty({
    description:
      'Opaque, single-use refresh token. Rotated by POST /auth/refresh.',
  })
  refreshToken: string;
}

export class TokensResponse {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({ example: 900 })
  accessTokenExpiresIn: number;

  @ApiProperty()
  refreshToken: string;
}

export class MessageResponse {
  @ApiProperty({
    example: "If an account exists for this email, we've sent a reset link.",
  })
  message: string;
}
