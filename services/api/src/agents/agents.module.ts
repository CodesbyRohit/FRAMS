import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { MemoryModule } from '../memory/memory.module';
import { RagModule } from '../rag/rag.module';
import { TrustModule } from '../trust/trust.module';
import { TwinModule } from '../twin/twin.module';
import { CopilotResolver } from './copilot.resolver';
import { CopilotService } from './copilot.service';

@Module({
  imports: [
    MemoryModule,
    KnowledgeModule,
    RagModule,
    TwinModule,
    TrustModule,
    IdentityModule,
  ],
  providers: [CopilotService, CopilotResolver],
})
export class AgentsModule {}
