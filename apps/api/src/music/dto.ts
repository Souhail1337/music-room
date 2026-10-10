import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SearchTracksQuery {
  @ApiProperty({ minLength: 1, maxLength: 100, example: 'daft punk' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1, { message: 'Type something to search.' })
  @MaxLength(100)
  q: string;
}
