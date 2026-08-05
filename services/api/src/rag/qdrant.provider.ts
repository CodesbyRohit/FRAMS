import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';

export const QDRANT = Symbol('ANIMA_QDRANT');

/** Qdrant collection names used across the platform. */
export const COLLECTIONS = {
  memories: 'anima_memories',
  documents: 'anima_documents',
} as const;

export function qdrantFactory(cfg: ConfigService): QdrantClient {
  return new QdrantClient({
    url: cfg.get('QDRANT_URL', 'http://localhost:6333'),
    apiKey: cfg.get('QDRANT_API_KEY', '') || undefined,
  });
}
