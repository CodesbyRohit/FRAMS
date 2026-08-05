import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';

import { CurrentPerson } from '../common/current-person.decorator';
import type { AuthenticatedPerson } from '../common/jwt-auth.guard';
import { MemoryEventGql, MemoryGql, TwinGql } from '../graphql/models';
import type { TwinEntity } from '../twin/twin.entity';
import { TwinService } from '../twin/twin.service';
import type { MemoryEventType } from '@anima/shared';
import { MemoryService } from './memory.service';
import { newId } from '../common/ids';

@Resolver()
export class MemoryResolver {
  constructor(
    private readonly memory: MemoryService,
    private readonly twins: TwinService,
  ) {}

  @Query(() => [MemoryGql], { description: 'Consolidated memories (the knowledge your twin holds).' })
  async myMemories(
    @CurrentPerson() person: AuthenticatedPerson,
    @Args('limit', { type: () => Int, nullable: true }) limit = 50,
  ): Promise<MemoryGql[]> {
    const rows = await this.memory.listMemories(person.personId, limit);
    return rows.map((m) => ({
      id: m.id,
      personId: m.personId,
      kind: m.kind,
      title: m.title,
      content: m.content,
      evidence: m.evidence.map((e) => ({ label: e.label, detail: e.label })),
      importance: m.importance,
      createdAt: m.createdAt,
    }));
  }

  @Query(() => [MemoryEventGql], { description: 'The raw interaction stream.' })
  async myMemoryEvents(
    @CurrentPerson() person: AuthenticatedPerson,
    @Args('limit', { type: () => Int, nullable: true }) limit = 50,
  ): Promise<MemoryEventGql[]> {
    const rows = await this.memory.listEvents(person.personId, limit);
    return rows.map((e) => ({
      id: e.id,
      personId: e.personId,
      type: e.type,
      summary: e.summary,
      payload: JSON.stringify(e.payload ?? {}),
      occurredAt: e.occurredAt,
      createdAt: e.createdAt,
    }));
  }

  @Query(() => [MemoryGql], { description: 'Semantic recall — find memories by meaning, not keywords.' })
  async searchMemories(
    @CurrentPerson() person: AuthenticatedPerson,
    @Args('query') query: string,
    @Args('limit', { type: () => Int, nullable: true }) limit = 8,
  ): Promise<MemoryGql[]> {
    const rows = await this.memory.searchMemories(person.personId, query, limit);
    return rows.map((m) => ({
      id: m.id,
      personId: m.personId,
      kind: m.kind,
      title: m.title,
      content: m.content,
      evidence: m.evidence.map((e) => ({ label: e.label, detail: e.label })),
      importance: m.importance,
      createdAt: m.createdAt,
    }));
  }

  @Mutation(() => MemoryEventGql, {
    description: 'Feed anything to your twin — a project update, a note, a memory.',
  })
  ingestMemory(
    @CurrentPerson() person: AuthenticatedPerson,
    @Args('type', { type: () => String }) type: MemoryEventType,
    @Args('summary') summary: string,
    @Args('payload', { type: () => String, nullable: true }) payloadJson?: string,
  ): Promise<MemoryEventGql> {
    const payload = payloadJson ? JSON.parse(payloadJson) : {};
    return this.memory
      .ingest({ personId: person.personId, type, summary, payload })
      .then((e) => ({
        id: e.id,
        personId: e.personId,
        type: e.type,
        summary: e.summary,
        payload: JSON.stringify(e.payload),
        occurredAt: e.occurredAt,
        createdAt: e.createdAt,
      }));
  }

  @Mutation(() => TwinGql, { description: 'Record a skill you learned or practiced.' })
  async markSkillLearned(
    @CurrentPerson() person: AuthenticatedPerson,
    @Args('name') name: string,
  ): Promise<TwinEntity> {
    await this.memory.ingest({
      personId: person.personId,
      type: 'SKILL_LEARNED',
      summary: `Practiced ${name}.`,
      payload: { skills: [name] },
    });
    return this.twins.getTwin(person.personId);
  }

  @Mutation(() => TwinGql, { description: 'Declare a goal. Your twin tracks it.' })
  async setGoal(
    @CurrentPerson() person: AuthenticatedPerson,
    @Args('title') title: string,
    @Args('description', { nullable: true }) description?: string,
  ): Promise<TwinEntity> {
    await this.memory.ingest({
      personId: person.personId,
      type: 'GOAL_SET',
      summary: `Declared a goal: ${title}.`,
      payload: { goal: title, description },
    });
    const twin = await this.twins.getTwin(person.personId);
    await this.twins.upsertGoal(person.personId, {
      id: newId('goal'),
      title,
      description,
      status: 'in_progress',
      progress: 0,
    });
    return this.twins.getTwin(person.personId);
  }
}
