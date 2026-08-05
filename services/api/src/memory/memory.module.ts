import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { KnowledgeModule } from '../knowledge/knowledge.module';
import { RagModule } from '../rag/rag.module';
import { TwinModule } from '../twin/twin.module';
import { EventBus } from './event-bus.service';
import { MemoryEntity } from './memory.entity';
import { MemoryEventEntity } from './memory-event.entity';
import { MemoryIndexer } from './memory-indexer.service';
import { MemoryResolver } from './memory.resolver';
import { MemoryService } from './memory.service';
import { SseController } from './sse.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([MemoryEventEntity, MemoryEntity]),
    TwinModule,
    KnowledgeModule,
    RagModule,
  ],
  controllers: [SseController],
  providers: [EventBus, MemoryService, MemoryIndexer, MemoryResolver],
  exports: [MemoryService, EventBus],
})
export class MemoryModule {}
