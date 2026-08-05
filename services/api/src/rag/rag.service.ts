import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { QdrantClient } from '@qdrant/js-client-rest';
import { Repository } from 'typeorm';

import { EmbeddingsClient } from '../ai/embeddings.client';
import { LlmClient } from '../ai/llm.client';
import { newId } from '../common/ids';
import { chunkText } from './chunker';
import { DocumentEntity } from './document.entity';
import { COLLECTIONS, QDRANT } from './qdrant.provider';

export interface UploadFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface RagSource {
  label: string;
  snippet: string;
  score: number;
}

const TEXT_MIME = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/xml',
  'text/html',
  'application/javascript',
  'application/typescript',
  'text/x-python',
  'text/x-java-source',
  'text/x-c',
  'text/x-c++src',
  'application/x-httpd-php',
]);

/**
 * Retrieval-Augmented Generation over a person's corpus.
 *
 * Pipeline: extract text (multimodal when a vision model is configured) →
 * chunk → embed → index in Qdrant → semantic search → grounded answer with
 * citations. Every answer carries its sources (explainable AI).
 */
@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private readonly visionModel?: string;

  constructor(
    private readonly cfg: ConfigService,
    private readonly embeddings: EmbeddingsClient,
    private readonly llm: LlmClient,
    @Inject(QDRANT) private readonly qdrant: QdrantClient,
    @InjectRepository(DocumentEntity)
    private readonly docs: Repository<DocumentEntity>,
  ) {
    this.visionModel = cfg.get('ANIMA_VISION_MODEL');
  }

  async listDocuments(personId: string): Promise<DocumentEntity[]> {
    return this.docs.find({ where: { personId }, order: { createdAt: 'DESC' } });
  }

  // ── Ingestion ─────────────────────────────────────────────────────────────

  async uploadDocument(personId: string, file: UploadFileLike): Promise<DocumentEntity> {
    const text = await this.extractText(file);
    if (!text.trim()) {
      throw new BadRequestException('No readable text could be extracted from this file.');
    }
    await this.ensureCollection(COLLECTIONS.documents);

    const doc = this.docs.create({
      id: newId('doc'),
      personId,
      title: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      chunkCount: 0,
      status: 'indexing',
    });
    await this.docs.save(doc);

    try {
      const chunks = chunkText(text);
      const vectors = await this.embeddings.embedMany(chunks);
      const points = chunks.map((chunk, i) => ({
        id: newId(`chunk_${doc.id}`),
        vector: vectors[i],
        payload: {
          documentId: doc.id,
          personId,
          chunkIndex: i,
          title: doc.title,
          content: chunk,
        },
      }));
      await this.qdrant.upsert(COLLECTIONS.documents, { points });

      doc.chunkCount = chunks.length;
      doc.status = 'indexed';
      await this.docs.save(doc);
      this.logger.log(`Indexed "${doc.title}" for ${personId} (${chunks.length} chunks)`);
      return doc;
    } catch (err) {
      doc.status = 'failed';
      await this.docs.save(doc);
      throw new ServiceUnavailableException(`Indexing failed: ${(err as Error).message}`);
    }
  }

  private async extractText(file: UploadFileLike): Promise<string> {
    if (TEXT_MIME.has(file.mimetype) || this.isCodeFilename(file.originalname)) {
      return file.buffer.toString('utf-8');
    }
    // Multimodal path: images and PDFs go through a vision-capable model when
    // configured. Without one, we fail loudly instead of pretending.
    if (this.visionModel) {
      return this.visionExtract(file);
    }
    throw new BadRequestException(
      `Unsupported format "${file.mimetype}". Provide text/markdown/code files, or configure ANIMA_VISION_MODEL for image/PDF understanding.`,
    );
  }

  private async visionExtract(file: UploadFileLike): Promise<string> {
    const base64 = file.buffer.toString('base64');
    const mime = file.mimetype.startsWith('image/') ? file.mimetype : 'application/pdf';
    const res = await fetch(
      `${this.cfg.get('ANIMA_LLM_BASE_URL', '').replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.cfg.get('ANIMA_LLM_API_KEY')
            ? { authorization: `Bearer ${this.cfg.get('ANIMA_LLM_API_KEY')}` }
            : {}),
        },
        body: JSON.stringify({
          model: this.visionModel,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Transcribe all readable text from this document/image. Preserve structure and headings.',
                },
                { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
              ],
            },
          ],
        }),
      },
    );
    if (!res.ok) {
      throw new ServiceUnavailableException(`Vision model failed (${res.status}).`);
    }
    const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    return data.choices?.[0]?.message?.content ?? '';
  }

  // ── Retrieval ─────────────────────────────────────────────────────────────

  async searchDocuments(
    personId: string,
    query: string,
    limit = 5,
  ): Promise<Array<{ content: string; score: number; title: string; documentId: string }>> {
    try {
      await this.ensureCollection(COLLECTIONS.documents);
      const vector = await this.embeddings.embed(query);
      const result = await this.qdrant.query(COLLECTIONS.documents, {
        query: vector,
        limit,
        with_payload: true,
        filter: { must: [{ key: 'personId', match: { value: personId } }] },
      });
      return result.points.map((hit) => ({
        content: (hit.payload as any)?.content ?? '',
        title: (hit.payload as any)?.title ?? 'unknown',
        documentId: (hit.payload as any)?.documentId ?? '',
        score: hit.score ?? 0,
      }));
    } catch (err) {
      if (this.isConnectivityError(err)) {
        return [];
      }
      throw err;
    }
  }

  /** Grounded answer: retrieve → prompt with context → cite sources. */
  async ask(
    personId: string,
    query: string,
  ): Promise<{ answer: string; sources: RagSource[]; latencyMs: number }> {
    const started = Date.now();
    const hits = await this.searchDocuments(personId, query, 6);
    if (hits.length === 0) {
      return {
        answer:
          'I could not find anything relevant in your knowledge corpus. Add documents (text, markdown, code, or images with a vision model) and ask again.',
        sources: [],
        latencyMs: Date.now() - started,
      };
    }

    const context = hits
      .map((h, i) => `[${i + 1}] ${h.title}\n${h.content.slice(0, 600)}`)
      .join('\n\n---\n\n');

    const answer = await this.llm.chat(
      `You are ANIMA's knowledge assistant. Answer the user's question using ONLY the provided context. ` +
        `Cite your sources inline as [n] matching the numbered context. If the context is insufficient, say so.`,
      `Question: ${query}\n\nContext:\n${context}`,
      { temperature: 0.2, maxTokens: 800 },
    );

    return {
      answer,
      sources: hits.map((h) => ({
        label: h.title,
        snippet: h.content.slice(0, 220),
        score: Math.round(h.score * 1000) / 1000,
      })),
      latencyMs: Date.now() - started,
    };
  }

  // ── Qdrant bootstrap ──────────────────────────────────────────────────────

  async ensureCollection(name: string, vectorSize?: number): Promise<void> {
    const collections = await this.qdrant.getCollections();
    if (collections.collections.some((c) => c.name === name)) {
      return;
    }
    await this.qdrant.createCollection(name, {
      vectors: { size: vectorSize ?? this.embeddings.dimension, distance: 'Cosine' },
    });
  }

  private isConnectivityError(err: unknown): boolean {
    const msg = (err as Error)?.message ?? '';
    return /ECONNREFUSED|ENOTFOUND|connect/i.test(msg);
  }

  private isCodeFilename(name: string): boolean {
    return /\.(md|txt|py|ts|tsx|js|jsx|json|csv|html|css|java|c|cpp|h|go|rs|php|sql)$/i.test(name);
  }
}
