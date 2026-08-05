import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QdrantClient } from '@qdrant/js-client-rest';
import { In, Repository } from 'typeorm';

import { EmbeddingsClient } from '../ai/embeddings.client';
import { newId } from '../common/ids';
import { COLLECTIONS, QDRANT } from '../rag/qdrant.provider';
import { EventBus } from './event-bus.service';
import { MemoryEntity } from './memory.entity';
import { MemoryEventEntity } from './memory-event.entity';
import type { MemoryEventType } from '@anima/shared';

export interface IngestInput {
  personId: string;
  type: MemoryEventType;
  summary: string;
  payload?: Record<string, unknown>;
  occurredAt?: string;
}

/**
 * The memory stream: every interaction becomes a structured, queryable,
 * explainable knowledge unit. Write path is event-sourced (append-only
 * MemoryEvent rows); the indexer materializes them into memories, vectors
 * and graph projections.
 */
@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    @InjectRepository(MemoryEventEntity)
    private readonly events: Repository<MemoryEventEntity>,
    @InjectRepository(MemoryEntity)
    private readonly memories: Repository<MemoryEntity>,
    private readonly embeddings: EmbeddingsClient,
    private readonly bus: EventBus,
    @Inject(QDRANT) private readonly qdrant: QdrantClient,
  ) {}

  /** Append an event to the stream and fan it out to consumers. */
  async ingest(input: IngestInput): Promise<MemoryEventEntity> {
    const event = this.events.create({
      id: newId('evt'),
      personId: input.personId,
      type: input.type,
      summary: input.summary,
      payload: input.payload ?? {},
      occurredAt: input.occurredAt ?? new Date().toISOString(),
    });
    const saved = await this.events.save(event);
    this.logger.log(`Memory event ${saved.type} for ${saved.personId}: ${saved.summary.slice(0, 60)}`);

    this.bus.publish({
      channel: 'memory.event.created',
      payload: { eventId: saved.id, ...saved },
    });
    return saved;
  }

  async listEvents(personId: string, limit = 50): Promise<MemoryEventEntity[]> {
    return this.events.find({
      where: { personId },
      order: { occurredAt: 'DESC' },
      take: limit,
    });
  }

  async listMemories(personId: string, limit = 50): Promise<MemoryEntity[]> {
    return this.memories.find({
      where: { personId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /** Semantic recall over consolidated memories (Qdrant, person-scoped). */
  async searchMemories(personId: string, query: string, limit = 8): Promise<MemoryEntity[]> {
    try {
      const collections = await this.qdrant.getCollections();
      if (!collections.collections.some((c) => c.name === COLLECTIONS.memories)) {
        return [];
      }
      const vector = await this.embeddings.embed(query);
      const result = await this.qdrant.query(COLLECTIONS.memories, {
        query: vector,
        limit,
        with_payload: true,
        filter: { must: [{ key: 'personId', match: { value: personId } }] },
      });
      const ids = result.points
        .map((hit) => (hit.payload as any)?.memoryId as string)
        .filter(Boolean);
      if (ids.length === 0) {
        return [];
      }
      const found = await this.memories.find({ where: { id: In(ids) } });
      const byId = new Map(found.map((m) => [m.id, m]));
      return ids.map((id) => byId.get(id)).filter((m): m is MemoryEntity => !!m);
    } catch (err) {
      const msg = (err as Error)?.message ?? '';
      if (/ECONNREFUSED|ENOTFOUND|connect/i.test(msg)) {
        return [];
      }
      throw err;
    }
  }

  async getMemoryById(id: string): Promise<MemoryEntity | null> {
    return this.memories.findOne({ where: { id } });
  }
}
