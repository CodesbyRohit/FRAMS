import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DocumentEntity } from './document.entity';
import { qdrantFactory, QDRANT } from './qdrant.provider';
import { RagController } from './rag.controller';
import { RagResolver } from './rag.resolver';
import { RagService } from './rag.service';

@Module({
  imports: [TypeOrmModule.forFeature([DocumentEntity])],
  controllers: [RagController],
  providers: [
    RagService,
    RagResolver,
    {
      provide: QDRANT,
      inject: [ConfigService],
      useFactory: qdrantFactory,
    },
  ],
  exports: [RagService, QDRANT],
})
export class RagModule {}
