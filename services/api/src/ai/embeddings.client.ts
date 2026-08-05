import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Embeddings client for OpenAI-compatible `/embeddings` endpoints.
 * Used by the RAG pipeline and the memory indexer to build vector indexes.
 */
@Injectable()
export class EmbeddingsClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly dim: number;

  constructor(cfg: ConfigService) {
    this.baseUrl = cfg.get('ANIMA_LLM_BASE_URL', 'http://localhost:11434/v1').replace(/\/$/, '');
    this.apiKey = cfg.get('ANIMA_LLM_API_KEY', '');
    this.model = cfg.get('ANIMA_EMBEDDING_MODEL', 'text-embedding-3-small');
    // text-embedding-3-small default. Overridable for local models (e.g. 1024/4096).
    this.dim = cfg.get<number>('ANIMA_EMBEDDING_DIM', 1536);
  }

  get dimension(): number {
    return this.dim;
  }

  async embed(text: string): Promise<number[]> {
    return (await this.embedMany([text]))[0];
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Embeddings ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
    const vectors = data.data.map((d) => d.embedding);
    if (vectors.length !== texts.length) {
      throw new Error('Embeddings response count mismatch.');
    }
    return vectors;
  }
}
