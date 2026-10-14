import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DocumentEntity } from './document.entity';
import { qdrantFactory, QDRANT } from './qdrant.provider';
import { RagController } from './rag.controller';
import { RagResolver } from './rag.resolver';
import { RagService } from './rag.service';
import { VectorStore } from './vector-store.service';

@Module({
  imports: [TypeOrmModule.forFeature([DocumentEntity])],
  controllers: [RagController],
  providers: [
    RagService,
    RagResolver,
    VectorStore,
    {
      provide: QDRANT,
      inject: [ConfigService],
      useFactory: qdrantFactory,
    },
  ],
  exports: [RagService, VectorStore, QDRANT],
})
export class RagModule {}
