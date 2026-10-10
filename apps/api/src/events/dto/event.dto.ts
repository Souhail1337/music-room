import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export const VISIBILITIES = ['public', 'private'] as const;
export const LICENSES = ['everyone', 'invited', 'on_site'] as const;
export const SCOPES = ['discover', 'hosting', 'invited', 'joined'] as const;
export type VisibilityValue = (typeof VISIBILITIES)[number];
export type LicenseValue = (typeof LICENSES)[number];
export type ScopeValue = (typeof SCOPES)[number];

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Fields shared by create and edit. On-site needs lat, lng, radiusM, startsAt and endsAt (UTC). */
class EventFields {
  @ApiPropertyOptional({
    maxLength: 500,
    example: 'Bring your best tracks.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ enum: VISIBILITIES, default: 'public' })
  @IsOptional()
  @IsIn(VISIBILITIES)
  visibility?: VisibilityValue;

  @ApiPropertyOptional({
    enum: LICENSES,
    default: 'everyone',
    description:
      'Who can vote and suggest: everyone who can view, invited people only, or people at the venue during the time window.',
  })
  @IsOptional()
  @IsIn(LICENSES)
  license?: LicenseValue;

  @ApiPropertyOptional({ example: 48.8566, description: 'On-site venue.' })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ example: 2.3522, description: 'On-site venue.' })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiPropertyOptional({
    example: 100,
    minimum: 10,
    maximum: 5000,
    description: 'On-site radius in meters.',
  })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(5000)
  radiusM?: number;

  @ApiPropertyOptional({
    format: 'date-time',
    example: '2026-10-10T18:00:00.000Z',
    description: 'On-site window start (UTC).',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  startsAt?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    example: '2026-10-11T00:00:00.000Z',
    description: 'On-site window end (UTC), after startsAt.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  endsAt?: string;
}

export class CreateEventDto extends EventFields {
  @ApiProperty({ minLength: 1, maxLength: 80, example: "Karim's 25th" })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Give your event a name.' })
  @MaxLength(80)
  name: string;
}

export class UpdateEventDto extends EventFields {
  @ApiPropertyOptional({ minLength: 1, maxLength: 80 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Give your event a name.' })
  @MaxLength(80)
  name?: string;
}

export class ListEventsQuery {
  @ApiPropertyOptional({ enum: SCOPES, default: 'discover' })
  @IsOptional()
  @IsIn(SCOPES)
  scope?: ScopeValue;

  @ApiPropertyOptional({ maxLength: 100, description: 'Search by name.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: '`nextCursor` from the previous page.' })
  @IsOptional()
  @Matches(/^\d{1,6}$/)
  cursor?: string;
}

/** The caller's position, needed for on-site events (AD-5). */
export class LocationQuery {
  @ApiPropertyOptional({ example: 48.8566 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ example: 2.3522 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;
}

export class LocationDto {
  @ApiPropertyOptional({
    example: 48.8566,
    description: 'Required on on-site events.',
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({
    example: 2.3522,
    description: 'Required on on-site events.',
  })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;
}

export class SuggestDto extends LocationDto {
  @ApiProperty({
    description:
      'Deezer track ID. Title and artist are read from Deezer, never from the client.',
    example: '3135556',
  })
  @IsString()
  @Matches(/^\d{1,20}$/, { message: 'Unknown track.' })
  trackId: string;
}

export class AdvanceDto {
  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'The track the host believes is Now Playing (null when nothing plays). If it no longer matches, nothing changes.',
    example: '3135556',
  })
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  @MaxLength(20)
  expectedNowPlayingId: string | null;
}
