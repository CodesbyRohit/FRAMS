import { ServiceUnavailableException } from '@nestjs/common';

import { AiUnavailableError } from '../ai/ai-error';
import { RagService } from './rag.service';
import { ownerFilter, VectorStore, VectorStoreUnavailableError } from './vector-store.service';

const hit = (documentId: string, chunkIndex: number, score: number) => ({
  score,
  payload: { personId: 'person_a', documentId, chunkIndex, title: `${documentId}.md`, content: `chunk ${chunkIndex} of ${documentId}` },
});

function rag(opts: { search?: () => Promise<unknown[]>; embed?: () => Promise<number[]>; chat?: () => Promise<string> }) {
  const embeddings = {
    embed: jest.fn(opts.embed ?? (async () => [0.1])),
    embedMany: jest.fn(async (t: string[]) => t.map(() => [0.1])),
  };
  const llm = { chat: jest.fn(opts.chat ?? (async () => 'answer')) };
  const vectors = {
    search: jest.fn(opts.search ?? (async () => [])),
    upsert: jest.fn(async () => ['id']),
    deleteWhere: jest.fn(async () => undefined),
  };
  const saved: unknown[] = [];
  const docs = {
    create: (d: unknown) => d,
    save: jest.fn(async (d: unknown) => (saved.push(JSON.parse(JSON.stringify(d))), d)),
  };
  const cfg = { get: () => undefined };
  const svc = new RagService(cfg as never, embeddings as never, llm as never, vectors as never, docs as never);
  return { svc, vectors, llm, saved, embeddings };
}

describe('RAG answers', () => {
  it('cites genuine document ids and chunk indexes, and flags citations to nothing', async () => {
    const { svc } = rag({
      search: async () => [hit('doc_a', 3, 0.91234), hit('doc_b', 0, 0.7)],
      chat: async () => 'CRDTs merge state [1]; see also [2] and [7].',
    });
    const result = await svc.ask('person_a', 'what are CRDTs?');
    expect(result.status).toBe('ok');
    expect(result.generated).toBe(true);
    expect(result.sources).toEqual([
      { index: 1, documentId: 'doc_a', label: 'doc_a.md', chunkIndex: 3, snippet: 'chunk 3 of doc_a', score: 0.912 },
      { index: 2, documentId: 'doc_b', label: 'doc_b.md', chunkIndex: 0, snippet: 'chunk 0 of doc_b', score: 0.7 },
    ]);
    expect(result.citedSourceIndexes).toEqual([1, 2]);
    expect(result.invalidCitations).toEqual([7]);
  });

  it('returns no_results with no answer when nothing is retrieved (no LLM call)', async () => {
    const { svc, llm } = rag({ search: async () => [] });
    const result = await svc.ask('person_a', 'q');
    expect(result).toMatchObject({ status: 'no_results', answer: null, generated: false, sources: [] });
    expect(llm.chat).not.toHaveBeenCalled();
  });

  it('reports the vector store outage instead of "nothing found"', async () => {
    const { svc } = rag({ search: async () => Promise.reject(new VectorStoreUnavailableError('down')) });
    await expect(svc.ask('person_a', 'q')).resolves.toMatchObject({ status: 'unavailable', answer: null });
  });

  it('reports not_configured when there is no embedding model', async () => {
    const { svc } = rag({ embed: async () => Promise.reject(new AiUnavailableError('not_configured', 'x')) });
    await expect(svc.ask('person_a', 'q')).resolves.toMatchObject({ status: 'not_configured', answer: null });
  });

  it('keeps the retrieved passages but no answer when the model fails', async () => {
    const { svc } = rag({
      search: async () => [hit('doc_a', 1, 0.5)],
      chat: async () => Promise.reject(new AiUnavailableError('timeout', 'slow')),
    });
    const result = await svc.ask('person_a', 'q');
    expect(result).toMatchObject({ status: 'ok', answer: null, generated: false, citedSourceIndexes: [] });
    expect(result.generationNote).toMatch(/did not respond in time/);
    expect(result.sources).toHaveLength(1);
  });

  it('drops hits whose payload lacks a document id or chunk index (no fabricated citations)', async () => {
    const { svc } = rag({ search: async () => [hit('doc_a', 1, 0.5), { score: 0.9, payload: { personId: 'person_a', content: 'orphan' } }] });
    const result = await svc.searchDocuments('person_a', 'q');
    expect(result.hits.map((h) => h.documentId)).toEqual(['doc_a']);
  });
});

describe('Document upload', () => {
  const file = { originalname: 'notes.md', mimetype: 'text/markdown', size: 20, buffer: Buffer.from('# Notes\nCRDTs are neat.') };

  it('indexes chunks under the owner and records status=indexed', async () => {
    const { svc, vectors } = rag({});
    const doc = await svc.uploadDocument('person_a', file);
    expect(doc.status).toBe('indexed');
    expect(doc.chunkCount).toBeGreaterThan(0);
    const [, points] = vectors.upsert.mock.calls[0] as unknown as [string, Array<{ payload: Record<string, unknown> }>];
    expect(points[0].payload).toMatchObject({ personId: 'person_a', documentId: doc.id, chunkIndex: 0 });
  });

  it('marks the document failed and removes partial vectors when indexing fails', async () => {
    const { svc, vectors, saved } = rag({});
    vectors.upsert.mockRejectedValueOnce(new VectorStoreUnavailableError('down'));
    await expect(svc.uploadDocument('person_a', file)).rejects.toThrow(ServiceUnavailableException);
    expect((saved.at(-1) as { status: string }).status).toBe('failed');
    expect(vectors.deleteWhere).toHaveBeenCalledWith('anima_documents', 'person_a', { documentId: expect.any(String) });
  });
});

describe('Vector store isolation', () => {
  it('refuses unscoped filters', () => {
    expect(() => ownerFilter('')).toThrow();
    expect(ownerFilter('person_a', { documentId: 'd' }).must).toEqual([
      { key: 'personId', match: { value: 'person_a' } },
      { key: 'documentId', match: { value: 'd' } },
    ]);
  });

  it('filters by owner in the query and again on the returned payloads; uses UUID point ids', async () => {
    const qdrant = {
      getCollections: jest.fn(async () => ({ collections: [{ name: 'c' }] })),
      getCollection: jest.fn(async () => ({ config: { params: { vectors: { size: 2 } } } })),
      query: jest.fn(async () => ({
        points: [
          { score: 0.9, payload: { personId: 'person_a', memoryId: 'm1' } },
          { score: 0.8, payload: { personId: 'person_b', memoryId: 'm2' } },
        ],
      })),
      upsert: jest.fn(async () => ({})),
    };
    const store = new VectorStore(qdrant as never, { dimension: 2 } as never);
    const hits = await store.search<{ memoryId: string }>('c', 'person_a', [0, 1], 5);
    expect(hits.map((h) => h.payload.memoryId)).toEqual(['m1']);
    expect(qdrant.query).toHaveBeenCalledWith('c', expect.objectContaining({ filter: ownerFilter('person_a') }));

    const [id] = await store.upsert('c', [{ vector: [0, 1], payload: { personId: 'person_a' } }]);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('turns connectivity failures into VectorStoreUnavailableError', async () => {
    const qdrant = { getCollections: jest.fn(async () => Promise.reject(new Error('fetch failed'))) };
    const store = new VectorStore(qdrant as never, { dimension: 2 } as never);
    await expect(store.search('c', 'person_a', [0, 1], 5)).rejects.toThrow(VectorStoreUnavailableError);
  });
});
