import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Public, SkipEmailVerified } from '../decorators/public.decorator.js';

class HealthDto {
  @ApiProperty({ example: 'ok' })
  status: 'ok';
}

@ApiTags('health')
@Public()
@SkipEmailVerified()
@Controller('health')
export class HealthController {
  @Get()
  @ApiOkResponse({ type: HealthDto, description: 'The API is up.' })
  health(): HealthDto {
    return { status: 'ok' };
  }
}
