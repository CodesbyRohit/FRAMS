import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';

import { CurrentPerson } from '../common/current-person.decorator';
import { toIso } from '../common/dates';
import type { AuthenticatedPerson } from '../common/jwt-auth.guard';
import { optionalText, requireText } from '../common/validation';
import { IndexRetryGql, MemoryEventGql, MemoryGql, MemorySearchResultGql, TwinGql } from '../graphql/models';
import { toTwinGql } from '../identity/identity.resolver';
import { TwinService } from '../twin/twin.service';
import { validateUserEvent } from './event-input';
import type { MemoryEntity } from './memory.entity';
import type { MemoryEventEntity } from './memory-event.entity';
import { MemoryIndexer } from './memory-indexer.service';
import { MemoryService } from './memory.service';

const EVIDENCE_DETAIL: Record<string, string> = {
  memory_event: 'Recorded event',
  document: 'Source document',
};

/** Wire mapping; projection flags come straight from the row, never assumed. */
export function toMemoryGql(m: MemoryEntity, score?: number): MemoryGql {
  return {
    id: m.id,
    personId: m.personId,
    sourceEventId: m.sourceEventId ?? null,
    kind: m.kind,
    title: m.title,
    content: m.content,
    evidence: (m.evidence ?? []).map((e) => ({
      type: e.type,
      refId: e.id ?? null,
      label: e.label,
      detail: EVIDENCE_DETAIL[e.type] ?? e.type,
    })),
    importance: m.importance,
    vectorIndexed: m.vectorIndexed,
    graphSynced: m.graphSynced,
    score: score ?? null,
    createdAt: toIso(m.createdAt),
  };
}

function toEventGql(e: MemoryEventEntity): MemoryEventGql {
  return {
    id: e.id,
    personId: e.personId,
    type: e.type,
    summary: e.summary,
    payload: JSON.stringify(e.payload ?? {}),
    occurredAt: toIso(e.occurredAt),
    createdAt: toIso(e.createdAt),
  };
}

@Resolver()
export class MemoryResolver {
  constructor(
    private readonly memory: MemoryService,
    private readonly indexer: MemoryIndexer,
    private readonly twins: TwinService,
  ) {}

  @Query(() => [MemoryGql], { description: 'Consolidated memories (the knowledge your twin holds).' })
  async myMemories(
    @CurrentPerson() person: AuthenticatedPerson,
    @Args('limit', { type: () => Int, nullable: true }) limit = 50,
  ): Promise<MemoryGql[]> {
    const rows = await this.memory.listMemories(person.personId, limit);
    return rows.map((m) => toMemoryGql(m));
  }

  @Query(() => [MemoryEventGql], { description: 'The raw interaction stream.' })
  async myMemoryEvents(
    @CurrentPerson() person: AuthenticatedPerson,
    @Args('limit', { type: () => Int, nullable: true }) limit = 50,
  ): Promise<MemoryEventGql[]> {
    const rows = await this.memory.listEvents(person.personId, limit);
    return rows.map(toEventGql);
  }

  @Query(() => MemorySearchResultGql, {
    description: 'Semantic recall. status tells "nothing matched" apart from "search unavailable".',
  })
  async searchMemories(
    @CurrentPerson() person: AuthenticatedPerson,
    @Args('query') query: string,
    @Args('limit', { type: () => Int, nullable: true }) limit = 8,
  ): Promise<MemorySearchResultGql> {
    const result = await this.memory.searchMemories(
      person.personId,
      requireText(query, 'Query', { max: 500 }),
      limit,
    );
    return {
      status: result.status,
      message: result.message,
      items: result.items.map((m) => toMemoryGql(m, m.score)),
      unindexedCount: result.unindexedCount,
    };
  }

  @Mutation(() => MemoryEventGql, {
    description: 'Record something about yourself — a note, project update, skill practice, idea...',
  })
  async ingestMemory(
    @CurrentPerson() person: AuthenticatedPerson,
    @Args('type', { type: () => String }) type: string,
    @Args('summary') summary: string,
    @Args('payload', { type: () => String, nullable: true }) payloadJson?: string,
  ): Promise<MemoryEventGql> {
    // Only user event types; platform/audit types (verification, security...) are rejected.
    const input = validateUserEvent(type, summary, payloadJson);
    const event = await this.memory.ingest({ personId: person.personId, ...input, payload: { ...input.payload } });
    return toEventGql(event);
  }

  @Mutation(() => TwinGql, {
    description: 'Record a skill you practised. The twin updates asynchronously from the event stream.',
  })
  async markSkillLearned(
    @CurrentPerson() person: AuthenticatedPerson,
    @Args('name') name: string,
  ): Promise<TwinGql> {
    const skill = requireText(name, 'Skill', { max: 60 });
    await this.memory.ingest({
      personId: person.personId,
      type: 'SKILL_LEARNED',
      summary: `Practised ${skill}.`,
      payload: { skills: [skill] },
    });
    return toTwinGql(await this.twins.getTwin(person.personId));
  }

  @Mutation(() => TwinGql, { description: 'Declare a goal. Your twin tracks it.' })
  async setGoal(
    @CurrentPerson() person: AuthenticatedPerson,
    @Args('title') title: string,
    @Args('description', { type: () => String, nullable: true }) description?: string,
  ): Promise<TwinGql> {
    const goal = {
      title: requireText(title, 'Goal title', { max: 200 }),
      description: optionalText(description, 'Goal description', 1000) || undefined,
    };
    // Row-locked twin mutation; the event then feeds memory + graph projections.
    const twin = await this.twins.addGoal(person.personId, goal);
    await this.memory.ingest({
      personId: person.personId,
      type: 'GOAL_SET',
      summary: `Declared a goal: ${goal.title}.`,
      payload: { goal: goal.title },
    });
    return toTwinGql(twin);
  }

  @Mutation(() => IndexRetryGql, {
    description: 'Retry vector indexing / graph sync for your memories whose projection previously failed.',
  })
  retryMemoryIndexing(@CurrentPerson() person: AuthenticatedPerson): Promise<IndexRetryGql> {
    return this.indexer.retryPending(person.personId);
  }
}
