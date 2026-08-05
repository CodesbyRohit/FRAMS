import { Module } from '@nestjs/common';

import { KnowledgeResolver } from './knowledge.resolver';
import { KnowledgeService } from './knowledge.service';

@Module({
  providers: [KnowledgeService, KnowledgeResolver],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
