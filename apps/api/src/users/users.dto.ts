import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

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
