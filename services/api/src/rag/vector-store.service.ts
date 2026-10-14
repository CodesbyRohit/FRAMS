import { Inject, Injectable, Logger } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';
import { randomUUID } from 'crypto';

import { EmbeddingsClient } from '../ai/embeddings.client';
import { QDRANT } from './qdrant.provider';

export class VectorStoreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VectorStoreUnavailableError';
  }
}

export interface VectorHit<P> {
  score: number;
  payload: P;
}

type Filter = { must: Array<{ key: string; match: { value: string | number } }> };

/** Every query and deletion is scoped to one owner; there is no unscoped path. */
export function ownerFilter(personId: string, extra: Record<string, string | number> = {}): Filter {
  if (!personId) {
    throw new Error('ownerFilter requires a personId');
  }
  return {
    must: [
      { key: 'personId', match: { value: personId } },
      ...Object.entries(extra).map(([key, value]) => ({ key, match: { value } })),
    ],
  };
}

/** Qdrant only accepts unsigned integers or UUIDs as point ids. */
export function newPointId(): string {
  return randomUUID();
}

/**
 * Thin, person-scoped wrapper over Qdrant. Connectivity and configuration
 * problems surface as `VectorStoreUnavailableError` so callers can report
 * "semantic search unavailable" instead of "no results".
 */
@Injectable()
export class VectorStore {
  private readonly logger = new Logger(VectorStore.name);
  private readonly ensured = new Set<string>();

  constructor(
    @Inject(QDRANT) private readonly qdrant: QdrantClient,
    private readonly embeddings: EmbeddingsClient,
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      await this.qdrant.getCollections();
      return true;
    } catch {
      return false;
    }
  }

  private async wrap<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (err) {
      if (err instanceof VectorStoreUnavailableError) throw err;
      const msg = (err as Error)?.message ?? String(err);
      this.logger.warn(`Qdrant operation failed: ${msg}`);
      throw new VectorStoreUnavailableError(`Vector store error: ${msg}`);
    }
  }

  async ensureCollection(name: string): Promise<void> {
    if (this.ensured.has(name)) return;
    await this.wrap(async () => {
      const { collections } = await this.qdrant.getCollections();
      if (!collections.some((c) => c.name === name)) {
        await this.qdrant.createCollection(name, {
          vectors: { size: this.embeddings.dimension, distance: 'Cosine' },
        });
        await this.qdrant.createPayloadIndex(name, { field_name: 'personId', field_schema: 'keyword' });
      } else {
        const info = await this.qdrant.getCollection(name);
        const vectors = info.config?.params?.vectors as { size?: number } | undefined;
        if (vectors?.size && vectors.size !== this.embeddings.dimension) {
          throw new VectorStoreUnavailableError(
            `Collection "${name}" stores ${vectors.size}-d vectors but ANIMA_EMBEDDING_DIM is ${this.embeddings.dimension}.`,
          );
        }
      }
    });
    this.ensured.add(name);
  }

  async upsert(
    collection: string,
    points: Array<{ vector: number[]; payload: Record<string, unknown> & { personId: string } }>,
  ): Promise<string[]> {
    if (points.length === 0) return [];
    await this.ensureCollection(collection);
    const withIds = points.map((p) => ({ id: newPointId(), vector: p.vector, payload: p.payload }));
    await this.wrap(() => this.qdrant.upsert(collection, { wait: true, points: withIds }));
    return withIds.map((p) => p.id);
  }

  async search<P>(
    collection: string,
    personId: string,
    vector: number[],
    limit: number,
  ): Promise<Array<VectorHit<P>>> {
    await this.ensureCollection(collection);
    const result = await this.wrap(() =>
      this.qdrant.query(collection, {
        query: vector,
        limit: Math.max(1, Math.min(50, limit)),
        with_payload: true,
        filter: ownerFilter(personId),
      }),
    );
    return result.points
      .filter((p) => (p.payload as { personId?: string } | null)?.personId === personId)
      .map((p) => ({ score: p.score ?? 0, payload: p.payload as P }));
  }

  async deleteWhere(
    collection: string,
    personId: string,
    extra: Record<string, string | number> = {},
  ): Promise<void> {
    await this.wrap(async () => {
      const { collections } = await this.qdrant.getCollections();
      if (!collections.some((c) => c.name === collection)) return;
      await this.qdrant.delete(collection, { wait: true, filter: ownerFilter(personId, extra) });
    });
  }
}
