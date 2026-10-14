import { ServiceUnavailableException } from '@nestjs/common';
import { Args, Int, Query, Resolver } from '@nestjs/graphql';

import { CurrentPerson } from '../common/current-person.decorator';
import { toIso } from '../common/dates';
import type { AuthenticatedPerson } from '../common/jwt-auth.guard';
import { requireText } from '../common/validation';
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
      createdAt: toIso(d.createdAt),
    }));
  }

  @Query(() => RagResultGql, {
    description: 'Ask a question grounded in your documents. Sources carry document ids and chunk indexes.',
  })
  async askYourKnowledge(
    @CurrentPerson() person: AuthenticatedPerson,
    @Args('query') query: string,
  ): Promise<RagResultGql> {
    const q = requireText(query, 'Question', { max: 1000 });
    const result = await this.rag.ask(person.personId, q);
    return {
      status: result.status,
      answer: result.answer,
      generated: result.generated,
      generationNote: result.generationNote,
      sources: result.sources,
      citedSourceIndexes: result.citedSourceIndexes,
      invalidCitations: result.invalidCitations,
      query: q,
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
    const result = await this.rag.searchDocuments(
      person.personId,
      requireText(query, 'Query', { max: 500 }),
      Math.max(1, Math.min(25, limit ?? 5)),
    );
    if (result.status !== 'ok') {
      // An outage must not look like "nothing found".
      throw new ServiceUnavailableException(result.message);
    }
    return result.hits.map((h) => `[${h.title}] ${h.content.slice(0, 300)}`);
  }
}
