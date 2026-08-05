import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TwinEntity } from './twin.entity';
import { TwinService } from './twin.service';

@Module({
  imports: [TypeOrmModule.forFeature([TwinEntity])],
  providers: [TwinService],
  exports: [TwinService],
})
export class TwinModule {}
