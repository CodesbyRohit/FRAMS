import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QdrantClient } from '@qdrant/js-client-rest';
import { Repository } from 'typeorm';

import { EmbeddingsClient } from '../ai/embeddings.client';
import { newId } from '../common/ids';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { COLLECTIONS, QDRANT } from '../rag/qdrant.provider';
import { TwinService } from '../twin/twin.service';
import { EventBus } from './event-bus.service';
import { MemoryEntity } from './memory.entity';

const KIND_BY_TYPE: Record<string, string> = {
  IDENTITY_CREATED: 'IDENTITY_BORN',
  VERIFICATION_SUCCEEDED: 'TRUSTED_VERIFICATION',
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

const BASE_IMPORTANCE: Record<string, number> = {
  GOAL_SET: 0.9,
  SKILL_LEARNED: 0.8,
  PROJECT_UPDATE: 0.75,
  GOAL_UPDATED: 0.7,
  MEETING_ATTENDED: 0.65,
  DOCUMENT_ADDED: 0.6,
  CODE_COMMITTED: 0.7,
  IDEA_CREATED: 0.65,
};

/**
 * Async consumer of the memory event stream. For every event it:
 *  1. embeds + indexes the event in Qdrant (semantic recall),
 *  2. materializes a consolidated Memory row (the explainable unit),
 *  3. mutates the Digital Twin (skills, stats, interests),
 *  4. projects the event into the Neo4j knowledge graph.
 * Runs in-process, decoupled from the write path — exactly the event-driven
 * pattern the platform is built on.
 */
@Injectable()
export class MemoryIndexer implements OnModuleInit {
  private readonly logger = new Logger(MemoryIndexer.name);

  constructor(
    private readonly bus: EventBus,
    private readonly embeddings: EmbeddingsClient,
    private readonly twins: TwinService,
    private readonly knowledge: KnowledgeService,
    @InjectRepository(MemoryEntity)
    private readonly memories: Repository<MemoryEntity>,
    @Inject(QDRANT) private readonly qdrant: QdrantClient,
  ) {}

  onModuleInit(): void {
    this.bus.on('memory.event.created', (event) => void this.consume(event));
  }

  private async consume(event: {
    eventId: string;
    personId: string;
    type: string;
    summary: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    try {
      // Materialize the consolidated Memory row FIRST so its real id can
      // anchor both the vector payload and the graph projection. Indexing
      // with the event id instead would orphan every vector (semantic recall
      // would never find a matching row).
      const memory = await this.materializeMemory(event);
      await this.indexVector(memory.id, event);
      await this.updateTwin(event);
      await this.knowledge.syncEvent(event.personId, {
        ...event,
        payload: { ...(event.payload ?? {}), memoryId: memory.id },
      });
      this.bus.publish({ channel: 'twin.updated', payload: { personId: event.personId, version: Date.now() } });
    } catch (err) {
      this.logger.warn(
        `Indexer failed for event ${event.eventId}: ${(err as Error).message}`,
      );
    }
  }

  private async indexVector(
    memoryId: string,
    event: {
      personId: string;
      type: string;
      summary: string;
    },
  ): Promise<void> {
    try {
      const collections = await this.qdrant.getCollections();
      if (!collections.collections.some((c) => c.name === COLLECTIONS.memories)) {
        await this.qdrant.createCollection(COLLECTIONS.memories, {
          vectors: { size: this.embeddings.dimension, distance: 'Cosine' },
        });
      }
      const text = `[${event.type}] ${event.summary}`;
      const vector = await this.embeddings.embed(text);
      await this.qdrant.upsert(COLLECTIONS.memories, {
        points: [
          {
            id: memoryId,
            vector,
            payload: { personId: event.personId, memoryId, type: event.type, summary: event.summary },
          },
        ],
      });
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (!/ECONNREFUSED|ENOTFOUND|connect/i.test(msg)) {
        this.logger.warn(`Vector index skipped: ${msg}`);
      }
    }
  }

  private async materializeMemory(event: {
    eventId: string;
    personId: string;
    type: string;
    summary: string;
    payload?: Record<string, unknown>;
  }): Promise<MemoryEntity> {
    const payload = event.payload ?? {};
    const title = this.summarizeTitle(event);
    const evidence = [
      { type: 'memory_event', id: event.eventId, label: event.summary.slice(0, 80) },
      ...(typeof payload.project === 'string'
        ? [{ type: 'project', id: payload.project, label: payload.project }]
        : []),
    ];
    const entities = [
      ...(Array.isArray(payload.skills)
        ? (payload.skills as string[]).map((s) => ({ label: 'Skill', name: s }))
        : []),
      ...(typeof payload.project === 'string'
        ? [{ label: 'Project', name: payload.project as string }]
        : []),
    ];
    const importance = BASE_IMPORTANCE[event.type] ?? 0.5;

    const memory = this.memories.create({
      id: newId('mem'),
      personId: event.personId,
      kind: KIND_BY_TYPE[event.type] ?? event.type,
      title,
      content: event.summary,
      evidence: evidence as MemoryEntity['evidence'],
      entities: entities as MemoryEntity['entities'],
      importance,
    });
    return this.memories.save(memory);
  }

  private async updateTwin(event: {
    personId: string;
    type: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    const payload = event.payload ?? {};
    await this.twins.update(event.personId, { statsDelta: { interactions: 1, memories: 1 } });

    const skills = Array.isArray(payload.skills) ? (payload.skills as string[]) : [];
    for (const skill of skills) {
      await this.twins.upsertSkill(event.personId, skill);
    }
    const interests = Array.isArray(payload.interests) ? (payload.interests as string[]) : [];
    if (interests.length > 0) {
      const twin = await this.twins.getTwin(event.personId);
      const merged = [...new Set([...twin.interests, ...interests])].slice(0, 30);
      await this.twins.update(event.personId, { interests: merged });
    }
    if (typeof payload.project === 'string') {
      await this.twins.update(event.personId, { statsDelta: { projects: 1 } });
    }
    if (typeof payload.documentTitle === 'string') {
      await this.twins.update(event.personId, { statsDelta: { documents: 1 } });
    }
  }

  private summarizeTitle(event: { type: string; summary: string }): string {
    const prefix: Record<string, string> = {
      GOAL_SET: 'Goal: ',
      SKILL_LEARNED: 'Learned ',
      PROJECT_UPDATE: 'Project: ',
      DOCUMENT_ADDED: 'Document: ',
      MEETING_ATTENDED: 'Meeting: ',
      CODE_COMMITTED: 'Shipped: ',
      IDEA_CREATED: 'Idea: ',
    };
    const lead = prefix[event.type] ?? '';
    return lead + event.summary.slice(0, 90);
  }
}
