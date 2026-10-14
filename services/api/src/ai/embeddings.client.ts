import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AiUnavailableError, fetchWithTimeout, providerConfigured } from './ai-error';

/**
 * Embeddings client for OpenAI-compatible `/embeddings` endpoints. Used by the
 * RAG pipeline and the memory indexer. Responses are validated (count,
 * dimension, finite numbers) before anything reaches the vector store.
 */
@Injectable()
export class EmbeddingsClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly dim: number;
  private readonly timeoutMs: number;

  constructor(cfg: ConfigService) {
    this.baseUrl = String(cfg.get('ANIMA_LLM_BASE_URL', 'http://localhost:11434/v1')).replace(/\/$/, '');
    this.apiKey = String(cfg.get('ANIMA_LLM_API_KEY', '') ?? '');
    this.model = cfg.get('ANIMA_EMBEDDING_MODEL', 'text-embedding-3-small');
    // text-embedding-3-small default. Overridable for local models (e.g. 768 for nomic-embed-text).
    this.dim = Number(cfg.get('ANIMA_EMBEDDING_DIM', 1536));
    this.timeoutMs = Number(cfg.get('ANIMA_EMBEDDING_TIMEOUT_MS', 20_000));
  }

  get dimension(): number {
    return this.dim;
  }

  isConfigured(): boolean {
    return providerConfigured(this.baseUrl, this.apiKey);
  }

  async embed(text: string): Promise<number[]> {
    return (await this.embedMany([text]))[0];
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }
    if (!this.isConfigured()) {
      throw new AiUnavailableError('not_configured', 'No embedding model is configured.');
    }
    const vectors: number[][] = [];
    // Batch to keep request bodies bounded.
    for (let i = 0; i < texts.length; i += 64) {
      vectors.push(...(await this.request(texts.slice(i, i + 64))));
    }
    return vectors;
  }

  private async request(texts: string[]): Promise<number[][]> {
    const res = await fetchWithTimeout(
      `${this.baseUrl}/embeddings`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({ model: this.model, input: texts }),
      },
      this.timeoutMs,
    );
    if (!res.ok) {
      throw new AiUnavailableError('provider_error', `Embedding provider responded ${res.status}.`);
    }
    let data: { data?: Array<{ embedding?: unknown }> };
    try {
      data = (await res.json()) as typeof data;
    } catch {
      throw new AiUnavailableError('invalid_response', 'Embedding response was not JSON.');
    }
    const vectors = (data.data ?? []).map((d) => d.embedding);
    if (vectors.length !== texts.length) {
      throw new AiUnavailableError('invalid_response', 'Embedding response count mismatch.');
    }
    for (const v of vectors) {
      if (!Array.isArray(v) || v.length !== this.dim || v.some((x) => typeof x !== 'number' || !Number.isFinite(x))) {
        throw new AiUnavailableError(
          'invalid_response',
          `Embedding dimension mismatch: expected ${this.dim} (set ANIMA_EMBEDDING_DIM to match the model).`,
        );
      }
    }
    return vectors as number[][];
  }
}
