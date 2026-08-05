import { Args, Int, Query, Resolver } from '@nestjs/graphql';

import { CurrentPerson } from '../common/current-person.decorator';
import type { AuthenticatedPerson } from '../common/jwt-auth.guard';
import { DocumentGql, RagResultGql } from '../graphql/models';
import { RagService } from './rag.service';

@Resolver()
export class RagResolver {
  constructor(private readonly rag: RagService) {}

  @Query(() => [DocumentGql], { description: 'Documents in your knowledge corpus.' })
  async myDocuments(@CurrentPerson() person: AuthenticatedPerson): Promise<DocumentGql[]> {
    const docs = await this.rag.listDocuments(person.personId);
    return docs.map((d) => ({
      id: d.id,
      personId: d.personId,
      title: d.title,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      chunkCount: d.chunkCount,
      status: d.status,
      createdAt: d.createdAt,
    }));
  }

  @Query(() => RagResultGql, {
    description: 'Ask a question grounded in your knowledge corpus (RAG with citations).',
  })
  async askYourKnowledge(
    @CurrentPerson() person: AuthenticatedPerson,
    @Args('query') query: string,
  ): Promise<RagResultGql> {
    const result = await this.rag.ask(person.personId, query);
    return {
      answer: result.answer,
      sources: result.sources,
      query,
      latencyMs: result.latencyMs,
    };
  }

  @Query(() => [String], {
    description: 'Semantic search over your documents (returns matching snippets).',
  })
  async searchKnowledge(
    @CurrentPerson() person: AuthenticatedPerson,
    @Args('query') query: string,
    @Args('limit', { type: () => Int, nullable: true }) limit = 5,
  ): Promise<string[]> {
    const hits = await this.rag.searchDocuments(person.personId, query, limit);
    return hits.map((h) => `[${h.title}] ${h.content.slice(0, 300)}`);
  }
}
