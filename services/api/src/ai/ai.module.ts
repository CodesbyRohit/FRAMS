import { Global, Module } from '@nestjs/common';

import { EmbeddingsClient } from './embeddings.client';
import { LlmClient } from './llm.client';

@Global()
@Module({
  providers: [LlmClient, EmbeddingsClient],
  exports: [LlmClient, EmbeddingsClient],
})
export class AiModule {}
