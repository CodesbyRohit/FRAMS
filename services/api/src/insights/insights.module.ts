import { Module } from '@nestjs/common';

import { KnowledgeModule } from '../knowledge/knowledge.module';
import { MemoryModule } from '../memory/memory.module';
import { TwinModule } from '../twin/twin.module';
import { InsightsResolver } from './insights.resolver';
import { InsightsService } from './insights.service';

@Module({
  imports: [TwinModule, MemoryModule, KnowledgeModule],
  providers: [InsightsService, InsightsResolver],
})
export class InsightsModule {}
