import { Controller, Get, Module } from '@nestjs/common';

import { Public } from '../common/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  health(): Record<string, unknown> {
    return {
      service: 'anima-api',
      status: 'ok',
      time: new Date().toISOString(),
    };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
