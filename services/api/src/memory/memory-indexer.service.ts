import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { EmbeddingsClient } from '../ai/embeddings.client';
import { newId } from '../common/ids';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { COLLECTIONS } from '../rag/qdrant.provider';
import { VectorStore } from '../rag/vector-store.service';
import { twinOps, TwinService } from '../twin/twin.service';
import type { TwinEntity } from '../twin/twin.entity';
import { SECURITY_EVENT_TYPES } from './event-input';
import { EventBus } from './event-bus.service';
import { MemoryEntity } from './memory.entity';
import { MemoryEventEntity } from './memory-event.entity';

const KIND_BY_TYPE: Record<string, string> = {
  DOCUMENT_ADDED: 'KNOWLEDGE_ADDED',
  NOTE_CREATED: 'NOTE',
  PROJECT_UPDATE: 'PROJECT_WORK',
  SKILL_LEARNED: 'LEARNED_SKILL',
  GOAL_SET: 'GOAL_DECLARED',
  GOAL_UPDATED: 'GOAL_PROGRESS',
  MEETING_ATTENDED: 'COLLABORATION',
  CODE_COMMITTED: 'CODE_SHIPPED',
  CHAT_CREATED: 'IDEA_EXCHANGE',
  IDEA_CREATED: 'NEW_IDEA',
  LINK_SHARED: 'RESOURCE_SHARED',
  FEEDBACK_GIVEN: 'FEEDBACK',
};

/** Fixed, rule-based weights by event type. Documented as such in the UI. */
export const BASE_IMPORTANCE: Record<string, number> = {
  GOAL_SET: 0.9,
  SKILL_LEARNED: 0.8,
  PROJECT_UPDATE: 0.75,
  GOAL_UPDATED: 0.7,
  CODE_COMMITTED: 0.7,
  MEETING_ATTENDED: 0.65,
  IDEA_CREATED: 0.65,
  DOCUMENT_ADDED: 0.6,
};

const TITLE_PREFIX: Record<string, string> = {
  GOAL_SET: 'Goal: ',
  SKILL_LEARNED: 'Practised ',
  PROJECT_UPDATE: 'Project: ',
  DOCUMENT_ADDED: 'Document: ',
  MEETING_ATTENDED: 'Meeting: ',
  CODE_COMMITTED: 'Shipped: ',
  IDEA_CREATED: 'Idea: ',
};

export interface IndexableEvent {
  eventId: string;
  personId: string;
  type: string;
  summary: string;
  payload?: Record<string, unknown>;
  occurredAt?: string;
}

/** The twin change implied by one knowledge event (pure; unit-tested). */
export function applyEventToTwin(twin: TwinEntity, event: IndexableEvent, at: Date): void {
  const p = event.payload ?? {};
  twinOps.addStats(twin, {
    interactions: 1,
    memories: 1,
    projects: typeof p.project === 'string' ? 1 : 0,
    documents: event.type === 'DOCUMENT_ADDED' ? 1 : 0,
  });
  twinOps.touchActiveDay(twin, at);
  if (Array.isArray(p.skills)) {
    for (const skill of p.skills) {
      if (typeof skill === 'string') twinOps.observeSkill(twin, skill, at);
    }
  }
  if (Array.isArray(p.interests)) {
    twinOps.mergeInterests(twin, p.interests.filter((i): i is string => typeof i === 'string'));
  }
}

/**
 * Async consumer of the memory event stream. For each knowledge event it:
 *  1. materializes a consolidated Memory row (the explainable unit),
 *  2. applies the event to the Digital Twin in one locked transaction,
 *  3. embeds + indexes it in Qdrant, recording whether that succeeded,
 *  4. projects it into the person's knowledge graph, recording the outcome.
 * Security/audit events (sign-ins, factor changes) stay in the event stream
 * only; they are not knowledge about the person and never touch the twin.
 */
@Injectable()
export class MemoryIndexer implements OnModuleInit {
  private readonly logger = new Logger(MemoryIndexer.name);

  constructor(
    private readonly bus: EventBus,
    private readonly embeddings: EmbeddingsClient,
    private readonly vectors: VectorStore,
    private readonly twins: TwinService,
    private readonly knowledge: KnowledgeService,
    @InjectRepository(MemoryEntity)
    private readonly memories: Repository<MemoryEntity>,
    @InjectRepository(MemoryEventEntity)
    private readonly events: Repository<MemoryEventEntity>,
  ) {}

  onModuleInit(): void {
    this.bus.on('memory.event.created', (event) => this.consume(event as IndexableEvent));
  }

  async consume(event: IndexableEvent): Promise<void> {
    if (SECURITY_EVENT_TYPES.includes(event.type as never)) {
      return;
    }
    try {
      const memory = await this.materializeMemory(event);
      await this.twins.mutate(event.personId, (twin) =>
        applyEventToTwin(twin, event, new Date(event.occurredAt ?? Date.now())),
      );
      await this.project(memory, event);
      this.bus.publish({ channel: 'twin.updated', payload: { personId: event.personId, version: Date.now() } });
    } catch (err) {
      this.logger.warn(`Indexer failed for event ${event.eventId}: ${(err as Error).message}`);
    }
  }

  /** Vector + graph projections for one memory; flags record what succeeded. */
  private async project(memory: MemoryEntity, event: IndexableEvent): Promise<void> {
    if (!memory.vectorIndexed) {
      try {
        const vector = await this.embeddings.embed(`[${event.type}] ${memory.title}\n${memory.content}`);
        await this.vectors.upsert(COLLECTIONS.memories, [
          {
            vector,
            payload: { personId: memory.personId, memoryId: memory.id, type: event.type },
          },
        ]);
        memory.vectorIndexed = true;
      } catch (err) {
        this.logger.debug(`Memory ${memory.id} not vector-indexed: ${(err as Error).message}`);
      }
    }
    if (!memory.graphSynced) {
      memory.graphSynced = await this.knowledge.syncEvent(memory.personId, {
        type: event.type,
        summary: event.summary,
        payload: { ...(event.payload ?? {}), memoryId: memory.id },
      });
    }
    await this.memories.update(
      { id: memory.id, personId: memory.personId },
      { vectorIndexed: memory.vectorIndexed, graphSynced: memory.graphSynced },
    );
  }

  private async materializeMemory(event: IndexableEvent): Promise<MemoryEntity> {
    const existing = await this.memories.findOne({
      where: { personId: event.personId, sourceEventId: event.eventId },
    });
    if (existing) {
      return existing; // idempotent: a replayed event never duplicates its memory
    }
    const payload = event.payload ?? {};
    const evidence = [
      { type: 'memory_event', id: event.eventId, label: event.summary.slice(0, 80) },
      ...(typeof payload.documentId === 'string'
        ? [{ type: 'document', id: payload.documentId, label: String(payload.documentTitle ?? 'Document') }]
        : []),
    ];
    const entities = [
      ...(Array.isArray(payload.skills)
        ? payload.skills.filter((s): s is string => typeof s === 'string').map((s) => ({ label: 'Skill', name: s }))
        : []),
      ...(typeof payload.project === 'string' ? [{ label: 'Project', name: payload.project }] : []),
    ];
    const memory = this.memories.create({
      id: newId('mem'),
      personId: event.personId,
      sourceEventId: event.eventId,
      kind: KIND_BY_TYPE[event.type] ?? event.type,
      title: (TITLE_PREFIX[event.type] ?? '') + event.summary.slice(0, 90),
      content: event.summary,
      evidence,
      entities,
      importance: BASE_IMPORTANCE[event.type] ?? 0.5,
      vectorIndexed: false,
      graphSynced: false,
    });
    return this.memories.save(memory);
  }

  /**
   * Retry vector indexing and graph projection for every memory whose
   * projection previously failed (e.g. Qdrant or Neo4j was down).
   */
  async retryPending(personId: string): Promise<{ vectorIndexed: number; graphSynced: number; remaining: number }> {
    const pending = await this.memories.find({
      where: [
        { personId, vectorIndexed: false },
        { personId, graphSynced: false },
      ],
      take: 500,
    });
    let vectorIndexed = 0;
    let graphSynced = 0;
    for (const memory of pending) {
      const event = memory.sourceEventId
        ? await this.events.findOne({ where: { id: memory.sourceEventId, personId } })
        : null;
      const before = { v: memory.vectorIndexed, g: memory.graphSynced };
      await this.project(memory, {
        eventId: memory.sourceEventId ?? memory.id,
        personId,
        type: event?.type ?? memory.kind,
        summary: event?.summary ?? memory.content,
        payload: event?.payload ?? {},
      });
      if (!before.v && memory.vectorIndexed) vectorIndexed++;
      if (!before.g && memory.graphSynced) graphSynced++;
    }
    const remaining = await this.memories.count({
      where: [
        { personId, vectorIndexed: false },
        { personId, graphSynced: false },
      ],
    });
    return { vectorIndexed, graphSynced, remaining };
  }
}
