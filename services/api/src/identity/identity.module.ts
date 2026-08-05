import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TwinModule } from '../twin/twin.module';
import { IdentityResolver } from './identity.resolver';
import { IdentityService } from './identity.service';
import { PersonEntity } from './person.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PersonEntity]), TwinModule],
  providers: [IdentityResolver, IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
