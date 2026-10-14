import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import type { MemoryEventType } from '@anima/shared';

import { AiUnavailableError, describeAiFailure } from '../ai/ai-error';
import { EmbeddingsClient } from '../ai/embeddings.client';
import { newId } from '../common/ids';
import { COLLECTIONS } from '../rag/qdrant.provider';
import { VectorStore, VectorStoreUnavailableError } from '../rag/vector-store.service';
import { EventBus } from './event-bus.service';
import { MemoryEntity } from './memory.entity';
import { MemoryEventEntity } from './memory-event.entity';

export interface IngestInput {
  personId: string;
  type: MemoryEventType;
  summary: string;
  payload?: Record<string, unknown>;
  occurredAt?: string;
}

export type SearchStatus = 'ok' | 'unavailable' | 'not_configured';

export interface MemorySearchResult {
  status: SearchStatus;
  /** Human-readable reason when status is not 'ok'. */
  message?: string;
  items: Array<MemoryEntity & { score: number }>;
  /** Memories not yet in the vector index (they cannot be found by meaning). */
  unindexedCount: number;
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
    private readonly vectors: VectorStore,
    private readonly bus: EventBus,
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
    this.logger.log(`Memory event ${saved.type} recorded (${saved.id})`);

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
      take: clampLimit(limit, 200),
    });
  }

  async listMemories(personId: string, limit = 50): Promise<MemoryEntity[]> {
    return this.memories.find({
      where: { personId },
      order: { createdAt: 'DESC' },
      take: clampLimit(limit, 200),
    });
  }

  /** A memory the person owns, or null. Never returns another person's row. */
  getOwnedMemory(personId: string, id: string): Promise<MemoryEntity | null> {
    return this.memories.findOne({ where: { id, personId } });
  }

  getOwnedEvent(personId: string, id: string): Promise<MemoryEventEntity | null> {
    return this.events.findOne({ where: { id, personId } });
  }

  async countUnindexed(personId: string): Promise<number> {
    return this.memories.count({ where: { personId, vectorIndexed: false } });
  }

  /** Semantic recall over consolidated memories (Qdrant, person-scoped). */
  async searchMemories(personId: string, query: string, limit = 8): Promise<MemorySearchResult> {
    const unindexedCount = await this.countUnindexed(personId);
    let vector: number[];
    try {
      vector = await this.embeddings.embed(query);
    } catch (err) {
      if (err instanceof AiUnavailableError) {
        return {
          status: err.kind === 'not_configured' ? 'not_configured' : 'unavailable',
          message: `Semantic search is unavailable: ${describeAiFailure(err.kind)}`,
          items: [],
          unindexedCount,
        };
      }
      throw err;
    }
    let hits;
    try {
      hits = await this.vectors.search<{ memoryId?: string }>(
        COLLECTIONS.memories,
        personId,
        vector,
        clampLimit(limit, 25),
      );
    } catch (err) {
      if (err instanceof VectorStoreUnavailableError) {
        return {
          status: 'unavailable',
          message: 'Semantic search is unavailable: the vector store (Qdrant) cannot be reached.',
          items: [],
          unindexedCount,
        };
      }
      throw err;
    }
    const scores = new Map<string, number>();
    for (const h of hits) {
      if (h.payload.memoryId && !scores.has(h.payload.memoryId)) {
        scores.set(h.payload.memoryId, h.score);
      }
    }
    if (scores.size === 0) {
      return { status: 'ok', items: [], unindexedCount };
    }
    // Re-check ownership against Postgres, not just the vector payload.
    const found = await this.memories.find({ where: { id: In([...scores.keys()]), personId } });
    const byId = new Map(found.map((m) => [m.id, m]));
    const items = [...scores.entries()]
      .map(([id, score]) => {
        const m = byId.get(id);
        return m ? Object.assign(m, { score }) : null;
      })
      .filter((m): m is MemoryEntity & { score: number } => !!m);
    return { status: 'ok', items, unindexedCount };
  }

  /** Erase every memory, event and memory vector of a person. */
  async deleteAllFor(personId: string, manager: EntityManager): Promise<void> {
    await manager.getRepository(MemoryEntity).delete({ personId });
    await manager.getRepository(MemoryEventEntity).delete({ personId });
  }

  deleteVectorsFor(personId: string): Promise<void> {
    return this.vectors.deleteWhere(COLLECTIONS.memories, personId);
  }
}

function clampLimit(limit: number | undefined, max: number): number {
  const n = Number.isFinite(limit) ? Math.floor(limit as number) : 50;
  return Math.max(1, Math.min(max, n));
}
