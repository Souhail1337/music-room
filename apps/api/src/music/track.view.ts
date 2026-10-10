import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** A track as the API returns it. Never carries a preview URL (AD-8). */
export class TrackView {
  @ApiProperty({ description: 'Deezer track ID.', example: '3135556' })
  id: string;

  @ApiProperty({ example: 'One More Time' })
  title: string;

  @ApiProperty({ example: 'Daft Punk' })
  artist: string;

  @ApiPropertyOptional({
    nullable: true,
    type: String,
    example: 'https://e-cdns-images.dzcdn.net/images/cover/…/250x250.jpg',
  })
  artworkUrl: string | null;

  @ApiProperty({ example: 320 })
  durationSec: number;

  static of(t: {
    id: string;
    title: string;
    artist: string;
    artworkUrl: string | null;
    durationSec: number;
  }): TrackView {
    return {
      id: t.id,
      title: t.title,
      artist: t.artist,
      artworkUrl: t.artworkUrl,
      durationSec: t.durationSec,
    };
  }
}

export class TrackListView {
  @ApiProperty({ type: [TrackView] })
  items: TrackView[];
}

export class PreviewView {
  @ApiProperty({ example: '3135556' })
  trackId: string;

  @ApiProperty({
    description:
      'Fresh 30-second MP3 URL from Deezer. Short-lived: fetch it just before playing.',
  })
  previewUrl: string;
}
