import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AiUnavailableError, describeAiFailure } from '../ai/ai-error';
import { checkCitations, fenceUntrusted } from '../ai/citations';
import { EmbeddingsClient } from '../ai/embeddings.client';
import { LlmClient } from '../ai/llm.client';
import { newId } from '../common/ids';
import { chunkText } from './chunker';
import { DocumentEntity } from './document.entity';
import { COLLECTIONS } from './qdrant.provider';
import { VectorStore, VectorStoreUnavailableError } from './vector-store.service';

export interface UploadFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** A retrieved chunk the answer may cite as [index]. */
export interface RagSource {
  index: number;
  documentId: string;
  label: string;
  chunkIndex: number;
  snippet: string;
  score: number;
}

export type RagStatus = 'ok' | 'no_results' | 'unavailable' | 'not_configured';

export interface RagAnswer {
  status: RagStatus;
  /** Null when no answer could be generated (nothing retrieved, or no model). */
  answer: string | null;
  generated: boolean;
  generationNote?: string;
  sources: RagSource[];
  citedSourceIndexes: number[];
  invalidCitations: number[];
  latencyMs: number;
}

export interface DocumentHit {
  documentId: string;
  chunkIndex: number;
  title: string;
  content: string;
  score: number;
}

export interface DocumentSearchResult {
  status: 'ok' | 'unavailable' | 'not_configured';
  message?: string;
  hits: DocumentHit[];
}

interface ChunkPayload {
  personId: string;
  documentId?: unknown;
  chunkIndex?: unknown;
  title?: unknown;
  content?: unknown;
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
    private readonly vectors: VectorStore,
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
      // VectorStore assigns UUID point ids (Qdrant rejects prefixed string ids).
      await this.vectors.upsert(
        COLLECTIONS.documents,
        chunks.map((chunk, i) => ({
          vector: vectors[i],
          payload: { personId, documentId: doc.id, chunkIndex: i, title: doc.title, content: chunk },
        })),
      );

      doc.chunkCount = chunks.length;
      doc.status = 'indexed';
      await this.docs.save(doc);
      this.logger.log(`Indexed "${doc.title}" for ${personId} (${chunks.length} chunks)`);
      return doc;
    } catch (err) {
      doc.status = 'failed';
      await this.docs.save(doc);
      // Don't leave orphaned chunks of a failed document searchable.
      await this.vectors.deleteWhere(COLLECTIONS.documents, personId, { documentId: doc.id }).catch(() => undefined);
      const reason =
        err instanceof AiUnavailableError ? describeAiFailure(err.kind) : (err as Error).message;
      throw new ServiceUnavailableException(`Indexing failed: ${reason}`);
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

  /** Person-scoped semantic search. Outages are reported, never disguised as "no results". */
  async searchDocuments(personId: string, query: string, limit = 5): Promise<DocumentSearchResult> {
    let vector: number[];
    try {
      vector = await this.embeddings.embed(query);
    } catch (err) {
      if (err instanceof AiUnavailableError) {
        return {
          status: err.kind === 'not_configured' ? 'not_configured' : 'unavailable',
          message: `Document search is unavailable: ${describeAiFailure(err.kind)}`,
          hits: [],
        };
      }
      throw err;
    }
    let raw;
    try {
      raw = await this.vectors.search<ChunkPayload>(COLLECTIONS.documents, personId, vector, limit);
    } catch (err) {
      if (err instanceof VectorStoreUnavailableError) {
        return {
          status: 'unavailable',
          message: 'Document search is unavailable: the vector store (Qdrant) cannot be reached.',
          hits: [],
        };
      }
      throw err;
    }
    const hits = raw
      .filter((h) => typeof h.payload.documentId === 'string' && Number.isInteger(h.payload.chunkIndex))
      .map((h) => ({
        documentId: h.payload.documentId as string,
        chunkIndex: h.payload.chunkIndex as number,
        title: typeof h.payload.title === 'string' ? h.payload.title : 'Untitled document',
        content: typeof h.payload.content === 'string' ? h.payload.content : '',
        score: h.score,
      }));
    return { status: 'ok', hits };
  }

  /** Grounded answer: retrieve → prompt with fenced context → validate citations. */
  async ask(personId: string, query: string): Promise<RagAnswer> {
    const started = Date.now();
    const search = await this.searchDocuments(personId, query, 6);
    const done = (rest: Omit<RagAnswer, 'latencyMs'>): RagAnswer => ({ ...rest, latencyMs: Date.now() - started });

    if (search.status !== 'ok') {
      return done({
        status: search.status,
        answer: null,
        generated: false,
        generationNote: search.message,
        sources: [],
        citedSourceIndexes: [],
        invalidCitations: [],
      });
    }
    if (search.hits.length === 0) {
      return done({
        status: 'no_results',
        answer: null,
        generated: false,
        generationNote: 'Nothing in your documents matched this question.',
        sources: [],
        citedSourceIndexes: [],
        invalidCitations: [],
      });
    }

    const sources: RagSource[] = search.hits.map((h, i) => ({
      index: i + 1,
      documentId: h.documentId,
      label: h.title,
      chunkIndex: h.chunkIndex,
      snippet: h.content.slice(0, 220),
      score: Math.round(h.score * 1000) / 1000,
    }));
    const context = search.hits
      .map((h, i) => `[${i + 1}] ${h.title} (chunk ${h.chunkIndex})\n${h.content.slice(0, 600)}`)
      .join('\n\n---\n\n');

    try {
      const answer = await this.llm.chat(
        `You are ANIMA's knowledge assistant. Answer the user's question using ONLY the numbered sources. ` +
          `Cite them inline as [n]. If the sources are insufficient, say so. Never invent sources.`,
        `Question: ${query}\n\n${fenceUntrusted(context)}`,
        { temperature: 0.2, maxTokens: 800 },
      );
      return done({ status: 'ok', answer, generated: true, sources, ...checkCitations(answer, sources.length) });
    } catch (err) {
      // Retrieval worked: return the passages, but no generated answer.
      return done({
        status: 'ok',
        answer: null,
        generated: false,
        generationNote:
          err instanceof AiUnavailableError
            ? describeAiFailure(err.kind)
            : 'The language model failed, so no answer was generated.',
        sources,
        citedSourceIndexes: [],
        invalidCitations: [],
      });
    }
  }

  private isCodeFilename(name: string): boolean {
    return /\.(md|txt|py|ts|tsx|js|jsx|json|csv|html|css|java|c|cpp|h|go|rs|php|sql)$/i.test(name);
  }
}
