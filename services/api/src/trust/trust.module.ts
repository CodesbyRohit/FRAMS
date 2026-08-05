import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TrustProfileEntity } from './trust.entity';
import { TrustResolver } from './trust.resolver';
import { TrustService } from './trust.service';

@Module({
  imports: [TypeOrmModule.forFeature([TrustProfileEntity])],
  providers: [TrustService, TrustResolver],
  exports: [TrustService],
})
export class TrustModule {}
