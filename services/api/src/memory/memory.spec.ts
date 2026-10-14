import { BadRequestException } from '@nestjs/common';

import { AiUnavailableError } from '../ai/ai-error';
import type { AuthenticatedPerson } from '../common/jwt-auth.guard';
import { VectorStoreUnavailableError } from '../rag/vector-store.service';
import { MemoryResolver, toMemoryGql } from './memory.resolver';
import { MemoryService } from './memory.service';

const me: AuthenticatedPerson = { personId: 'person_a', email: 'a@example.com', sessionId: 's', method: 'passkey' };

function memoryRow(id: string, personId: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    personId,
    sourceEventId: `evt_${id}`,
    kind: 'NOTE',
    title: `Memory ${id}`,
    content: 'content',
    evidence: [{ type: 'memory_event', id: `evt_${id}`, label: 'Wrote a note' }],
    entities: [],
    importance: 0.5,
    vectorIndexed: true,
    graphSynced: false,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    ...extra,
  };
}

function service(opts: { embed?: () => Promise<number[]>; search?: () => Promise<unknown[]>; rows?: unknown[] }) {
  const memories = {
    count: jest.fn(async () => 2),
    find: jest.fn(async ({ where }: { where: { personId: string } }) =>
      (opts.rows ?? []).filter((r) => (r as { personId: string }).personId === where.personId),
    ),
  };
  const embeddings = { embed: jest.fn(opts.embed ?? (async () => [0.1, 0.2])) };
  const vectors = { search: jest.fn(opts.search ?? (async () => [])) };
  const svc = new MemoryService({} as never, memories as never, embeddings as never, vectors as never, {} as never);
  return { svc, memories, vectors };
}

describe('Memory search states', () => {
  it('reports not_configured (not "no results") when no embedding model is configured', async () => {
    const { svc } = service({ embed: async () => Promise.reject(new AiUnavailableError('not_configured', 'x')) });
    await expect(svc.searchMemories('person_a', 'q')).resolves.toMatchObject({
      status: 'not_configured',
      items: [],
      unindexedCount: 2,
    });
  });

  it('reports unavailable when the vector store is down', async () => {
    const { svc } = service({ search: async () => Promise.reject(new VectorStoreUnavailableError('down')) });
    const result = await svc.searchMemories('person_a', 'q');
    expect(result.status).toBe('unavailable');
    expect(result.message).toMatch(/Qdrant/);
  });

  it('returns ok with an empty list when nothing matches', async () => {
    const { svc } = service({ search: async () => [] });
    await expect(svc.searchMemories('person_a', 'q')).resolves.toEqual({ status: 'ok', items: [], unindexedCount: 2 });
  });

  it('re-checks ownership in Postgres and drops rows owned by someone else', async () => {
    const { svc, vectors } = service({
      search: async () => [
        { score: 0.9, payload: { memoryId: 'm_mine' } },
        { score: 0.8, payload: { memoryId: 'm_theirs' } },
      ],
      rows: [memoryRow('m_mine', 'person_a'), memoryRow('m_theirs', 'person_b')],
    });
    const result = await svc.searchMemories('person_a', 'q');
    expect(vectors.search).toHaveBeenCalledWith(expect.any(String), 'person_a', expect.any(Array), expect.any(Number));
    expect(result.items.map((m) => m.id)).toEqual(['m_mine']);
    expect(result.items[0].score).toBe(0.9);
  });
});

describe('Memory resolver', () => {
  function resolver() {
    const memory = {
      ingest: jest.fn(async (input: Record<string, unknown>) => ({
        id: 'evt_1',
        ...input,
        occurredAt: '2026-10-01T00:00:00.000Z',
        createdAt: '2026-10-01T00:00:00.000Z',
      })),
      searchMemories: jest.fn(async () => ({ status: 'unavailable', message: 'down', items: [], unindexedCount: 3 })),
    };
    const twin = { id: 'twin_1', personId: me.personId, version: 2, skills: [], goals: [], interests: [], narrative: '', stats: {}, updatedAt: 'now' };
    const twins = { addGoal: jest.fn(async () => twin), getTwin: jest.fn(async () => twin) };
    const r = new MemoryResolver(memory as never, {} as never, twins as never);
    return { r, memory, twins };
  }

  it('rejects platform-only event types so verification memories cannot be forged', async () => {
    const { r, memory } = resolver();
    for (const type of ['VERIFICATION_SUCCEEDED', 'IDENTITY_CREATED', 'SECURITY_CHANGED', 'GOAL_SET', 'DOCUMENT_ADDED']) {
      await expect(r.ingestMemory(me, type, 'Identity verified via face', undefined)).rejects.toThrow(BadRequestException);
    }
    expect(memory.ingest).not.toHaveBeenCalled();
  });

  it('rejects malformed payloads with 400 and records valid events for the caller only', async () => {
    const { r, memory } = resolver();
    await expect(r.ingestMemory(me, 'NOTE_CREATED', 'hi', '{bad')).rejects.toThrow(BadRequestException);
    await r.ingestMemory(me, 'NOTE_CREATED', '  Learned about CRDTs ', '{"skills":["CRDT"]}');
    expect(memory.ingest).toHaveBeenCalledWith({
      personId: 'person_a',
      type: 'NOTE_CREATED',
      summary: 'Learned about CRDTs',
      payload: { skills: ['CRDT'] },
    });
  });

  it('passes the search status through instead of an empty list', async () => {
    const { r } = resolver();
    await expect(r.searchMemories(me, 'what did I do', 8)).resolves.toEqual({
      status: 'unavailable',
      message: 'down',
      items: [],
      unindexedCount: 3,
    });
  });

  it('setGoal adds the goal under the twin lock, then records the event', async () => {
    const { r, memory, twins } = resolver();
    await r.setGoal(me, ' Ship ANIMA ', undefined);
    expect(twins.addGoal).toHaveBeenCalledWith('person_a', { title: 'Ship ANIMA', description: undefined });
    expect(memory.ingest).toHaveBeenCalledWith(
      expect.objectContaining({ personId: 'person_a', type: 'GOAL_SET', payload: { goal: 'Ship ANIMA' } }),
    );
  });

  it('maps projection flags from the row, never assuming success', () => {
    const gql = toMemoryGql(memoryRow('m1', 'person_a', { vectorIndexed: false, graphSynced: false }) as never);
    expect(gql).toMatchObject({ vectorIndexed: false, graphSynced: false, score: null, createdAt: '2026-10-01T00:00:00.000Z' });
    expect(gql.evidence).toEqual([{ type: 'memory_event', refId: 'evt_m1', label: 'Wrote a note', detail: 'Recorded event' }]);
  });
});
