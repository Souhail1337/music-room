import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const PLAYLIST_VISIBILITIES = ['public', 'private'] as const;
export const PLAYLIST_LICENSES = ['everyone', 'invited'] as const;
export const PLAYLIST_SCOPES = ['discover', 'mine', 'shared'] as const;
export type PlaylistVisibilityValue = (typeof PLAYLIST_VISIBILITIES)[number];
export type PlaylistLicenseValue = (typeof PLAYLIST_LICENSES)[number];
export type PlaylistScopeValue = (typeof PLAYLIST_SCOPES)[number];

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

class PlaylistFields {
  @ApiPropertyOptional({ maxLength: 500, example: 'For Saturday.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ enum: PLAYLIST_VISIBILITIES, default: 'public' })
  @IsOptional()
  @IsIn(PLAYLIST_VISIBILITIES)
  visibility?: PlaylistVisibilityValue;

  @ApiPropertyOptional({
    enum: PLAYLIST_LICENSES,
    default: 'everyone',
    description:
      'Who can edit the track list: everyone who can view it, or invited people only. The owner always can.',
  })
  @IsOptional()
  @IsIn(PLAYLIST_LICENSES)
  license?: PlaylistLicenseValue;
}

export class CreatePlaylistDto extends PlaylistFields {
  @ApiProperty({ minLength: 1, maxLength: 80, example: 'Road trip ☀️' })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Give your playlist a name.' })
  @MaxLength(80)
  name: string;
}

export class UpdatePlaylistDto extends PlaylistFields {
  @ApiPropertyOptional({ minLength: 1, maxLength: 80 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Give your playlist a name.' })
  @MaxLength(80)
  name?: string;
}

export class ListPlaylistsQuery {
  @ApiPropertyOptional({
    enum: PLAYLIST_SCOPES,
    default: 'discover',
    description:
      '`discover`: public playlists; `mine`: playlists I own; `shared`: playlists I am invited to.',
  })
  @IsOptional()
  @IsIn(PLAYLIST_SCOPES)
  scope?: PlaylistScopeValue;

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

/** Every track edit names the version it was made against (AD-3). */
export class BaseVersionDto {
  @ApiProperty({
    minimum: 1,
    example: 7,
    description:
      'The playlist `version` the edit was made against. If the playlist has changed since, nothing happens and the answer is 409 `VERSION_CONFLICT`.',
  })
  @IsInt()
  @Min(1)
  baseVersion: number;
}

/** `?baseVersion=` on DELETE (query strings are strings: converted first). */
export class BaseVersionQuery {
  @ApiProperty({ minimum: 1, example: 7 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  baseVersion: number;
}

export class AddTrackDto extends BaseVersionDto {
  @ApiProperty({
    description:
      'Deezer track ID. Title and artist are read from Deezer, never from the client.',
    example: '3135556',
  })
  @IsString()
  @Matches(/^\d{1,20}$/, { message: 'Unknown track.' })
  trackId: string;
}

export class MoveTrackDto extends BaseVersionDto {
  @ApiProperty({
    minimum: 0,
    example: 0,
    description:
      'Final 0-based index of the entry. Must be < the number of tracks.',
  })
  @IsInt()
  @Min(0)
  @Max(100_000)
  toIndex: number;
}
