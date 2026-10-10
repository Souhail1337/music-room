import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class SearchUsersQuery {
  @ApiProperty({ minLength: 2, maxLength: 100, example: 'sa' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2, { message: 'Type at least 2 characters.' })
  @MaxLength(100)
  q: string;
}

// --- Profile (FR-6, FR-7) ------------------------------------------------------------------------

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Trims every entry, drops empty ones and case-insensitive duplicates. */
const cleanList = ({ value }: { value: unknown }) => {
  if (!Array.isArray(value)) return value;
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      out.push(item);
      continue;
    }
    const text = item.trim();
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
  }
  return out;
};

const SECTION_HINT = 'Send an empty string (or empty list) to clear a field.';

export class PublicInfoDto {
  @ApiPropertyOptional({ maxLength: 280, description: SECTION_HINT })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(280)
  bio?: string;

  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  city?: string;
}

export class FriendsInfoDto {
  @ApiPropertyOptional({ maxLength: 30, description: SECTION_HINT })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ format: 'date', example: '1999-04-23' })
  @Transform(trim)
  // Absent or '' (clear) skips the checks below.
  @ValidateIf(
    (_o, value) => value !== undefined && value !== null && value !== '',
  )
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use a date written YYYY-MM-DD.' })
  @IsISO8601(
    { strict: true },
    { message: 'Use a real date written YYYY-MM-DD.' },
  )
  birthday?: string;
}

export class PrivateInfoDto {
  @ApiPropertyOptional({ maxLength: 80, description: SECTION_HINT })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  fullName?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  address?: string;
}

export class MusicPrefsDto {
  @ApiPropertyOptional({
    type: [String],
    maxItems: 10,
    description:
      'Each ≤ 40 characters; trimmed, empty entries and duplicates dropped.',
  })
  @IsOptional()
  @Transform(cleanList)
  @IsArray()
  @ArrayMaxSize(10, { message: 'Pick at most 10.' })
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  genres?: string[];

  @ApiPropertyOptional({ type: [String], maxItems: 10 })
  @IsOptional()
  @Transform(cleanList)
  @IsArray()
  @ArrayMaxSize(10, { message: 'Pick at most 10.' })
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  artists?: string[];
}

/**
 * Edit one or more profile sections. Only the sections (and, inside them, the fields) you send
 * change; an empty string or list clears that field.
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({
    minLength: 1,
    maxLength: 40,
    example: 'Yasmine',
    description: 'Public.',
  })
  // Absent is fine; null is not (the column is NOT NULL) and fails @IsString with 400.
  @ValidateIf((_o, value) => value !== undefined)
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Enter a display name.' })
  @MaxLength(40)
  displayName?: string;

  @ApiPropertyOptional({
    type: PublicInfoDto,
    description: 'Everyone sees it.',
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PublicInfoDto)
  public?: PublicInfoDto;

  @ApiPropertyOptional({
    type: FriendsInfoDto,
    description: 'Only your friends see it.',
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => FriendsInfoDto)
  friends?: FriendsInfoDto;

  @ApiPropertyOptional({
    type: PrivateInfoDto,
    description: 'Only you see it.',
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PrivateInfoDto)
  private?: PrivateInfoDto;

  @ApiPropertyOptional({
    type: MusicPrefsDto,
    description: 'Everyone sees it.',
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MusicPrefsDto)
  musicPrefs?: MusicPrefsDto;
}

// --- Friends (FR-8) and Google link (FR-3) -------------------------------------------------------

export class FriendRequestDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Who you want to be friends with.',
  })
  @IsString()
  @MaxLength(64)
  userId: string;
}
