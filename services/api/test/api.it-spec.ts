/**
 * Integration tests against real Postgres, Redis, Qdrant and Neo4j.
 *
 *   ANIMA_IT=1 npm run test:integration -w @anima/api
 *
 * Connection settings come from IT_* variables (defaults match the local
 * compose stack on the alternate ports). Use a dedicated database: TypeORM
 * `synchronize` runs against it. Model calls go to a local deterministic stub
 * (test/model-stub.ts); the Trust Service is deliberately unreachable.
 *
 * Tier 1 wires every API module (no HTTP transport) and drives the resolvers
 * with principals produced by the real session guard logic.
 * Tier 2 boots the full HTTP/GraphQL app; it is skipped — and says why — when
 * the Apollo Express integration package cannot be resolved.
 *
 * Passkey ceremonies need a real authenticator, so sessions are minted with
 * SessionsService.create — exactly what a successful ceremony calls.
 */
import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';

import { startModelStub, STUB_DIM } from './model-stub';

const enabled = process.env.ANIMA_IT === '1';
if (!enabled) {
  // eslint-disable-next-line no-console
  console.warn('Integration suites SKIPPED: set ANIMA_IT=1 with Postgres/Redis/Qdrant/Neo4j reachable.');
}

function apolloExpressResolvable(): boolean {
  try {
    require.resolve('@as-integrations/express5', { paths: [require.resolve('@nestjs/apollo')] });
    return true;
  } catch {
    return false;
  }
}

const FRAMES = Array.from({ length: 8 }, () => 'aGVsbG8=');
let stub: Server;

async function configureEnv(): Promise<void> {
  const model = await startModelStub();
  stub = model.server;
  Object.assign(process.env, {
    ANIMA_JWT_SECRET: 'integration-secret-integration-secret-0123456789',
    POSTGRES_HOST: process.env.IT_POSTGRES_HOST ?? 'localhost',
    POSTGRES_PORT: process.env.IT_POSTGRES_PORT ?? '55432',
    POSTGRES_DB: process.env.IT_POSTGRES_DB ?? 'anima_it',
    REDIS_URL: process.env.IT_REDIS_URL ?? 'redis://localhost:56379/9',
    QDRANT_URL: process.env.IT_QDRANT_URL ?? 'http://localhost:56333',
    NEO4J_URI: process.env.IT_NEO4J_URI ?? 'bolt://localhost:57687',
    TRUST_SERVICE_URL: 'http://127.0.0.1:9',
    TRUST_SERVICE_TIMEOUT_MS: '2000',
    ANIMA_LLM_BASE_URL: model.url,
    ANIMA_EMBEDDING_DIM: String(STUB_DIM),
    ANIMA_WEB_ORIGIN: 'http://localhost:3000',
  });
}

async function eventually<T>(read: () => Promise<T>, done: (v: T) => boolean, ms = 15_000): Promise<T> {
  const until = Date.now() + ms;
  let v = await read();
  while (!done(v) && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 250));
    v = await read();
  }
  return v;
}

(enabled ? describe : describe.skip)('Tier 1 — services and resolvers against real dependencies', () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let mod: TestingModule;
  let R: Record<string, any>;
  let verify: (token: string) => Promise<any>;
  let sessions: any;
  const created: string[] = [];
  const meta = { ip: '198.51.100.10', userAgent: 'integration' };

  let A: any;
  let B: any;
  let aPass: any;
  let aFace: any;
  let bPass: any;
  let pA: any;
  let pAFace: any;
  let pB: any;

  beforeAll(async () => {
    await configureEnv();
    const { Test } = await import('@nestjs/testing');
    const { ConfigModule, ConfigService } = await import('@nestjs/config');
    const { TypeOrmModule } = await import('@nestjs/typeorm');
    const { JwtService } = await import('@nestjs/jwt');
    const m = {
      ...(await import('../src/config/env.validation')),
      ...(await import('../src/redis/redis.module')),
      ...(await import('../src/ai/ai.module')),
      ...(await import('../src/auth/auth.module')),
      ...(await import('../src/identity/identity.module')),
      ...(await import('../src/memory/memory.module')),
      ...(await import('../src/rag/rag.module')),
      ...(await import('../src/knowledge/knowledge.module')),
      ...(await import('../src/twin/twin.module')),
      ...(await import('../src/trust/trust.module')),
      ...(await import('../src/insights/insights.module')),
      ...(await import('../src/agents/agents.module')),
    };
    mod = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: m.envValidationSchema, ignoreEnvFile: true }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.POSTGRES_HOST,
          port: Number(process.env.POSTGRES_PORT),
          username: 'anima',
          password: 'anima',
          database: process.env.POSTGRES_DB,
          autoLoadEntities: true,
          synchronize: true,
        }),
        m.RedisModule,
        m.AiModule,
        m.AuthModule,
        m.IdentityModule,
        m.MemoryModule,
        m.RagModule,
        m.KnowledgeModule,
        m.TwinModule,
        m.TrustModule,
        m.InsightsModule,
        m.AgentsModule,
      ],
    }).compile();
    await mod.init();

    const get = async (path: string, name: string) => mod.get((await import(path))[name]);
    R = {
      auth: await get('../src/auth/auth.resolver', 'AuthResolver'),
      identity: await get('../src/identity/identity.resolver', 'IdentityResolver'),
      memory: await get('../src/memory/memory.resolver', 'MemoryResolver'),
      rag: await get('../src/rag/rag.resolver', 'RagResolver'),
      ragService: await get('../src/rag/rag.service', 'RagService'),
      knowledge: await get('../src/knowledge/knowledge.resolver', 'KnowledgeResolver'),
      copilot: await get('../src/agents/copilot.resolver', 'CopilotResolver'),
      insights: await get('../src/insights/insights.resolver', 'InsightsResolver'),
      trust: await get('../src/trust/trust.resolver', 'TrustResolver'),
      knowledgeService: await get('../src/knowledge/knowledge.service', 'KnowledgeService'),
      vectors: await get('../src/rag/vector-store.service', 'VectorStore'),
    };
    sessions = await get('../src/auth/sessions.service', 'SessionsService');
    const { verifySessionToken } = await import('../src/common/jwt-auth.guard');
    verify = (token) => verifySessionToken(token, mod.get(JwtService), mod.get(ConfigService), sessions);
  });

  afterAll(async () => {
    if (mod) {
      const { COLLECTIONS } = await import('../src/rag/qdrant.provider');
      for (const id of created) {
        await R.knowledgeService.deleteAllFor(id);
        for (const c of Object.values(COLLECTIONS)) await R.vectors.deleteWhere(c, id).catch(() => undefined);
      }
      const { REDIS } = await import('../src/redis/redis.constants');
      const redis = mod.get(REDIS);
      await mod.close();
      // RedisModule has no shutdown hook; close the shared client so the process can exit.
      await redis.quit().catch(() => undefined);
    }
    stub?.close();
  });

  it('onboards with a single-use ticket bound to the new identity', async () => {
    const stamp = Date.now();
    A = await R.auth.onboard(meta, `alice-${stamp}@it.example.com`, 'Alice', ['engineer']);
    B = await R.auth.onboard(meta, `bob-${stamp}@it.example.com`, 'Bob', []);
    created.push(A.person.id, B.person.id);
    expect(A.registrationTicket).toEqual(expect.any(String));

    const options = JSON.parse(await R.auth.passkeyRegistrationOptions(A.registrationTicket));
    expect(Buffer.from(options.user.id, 'base64url').toString('utf8')).toBe(A.person.id);
    await expect(R.auth.passkeyRegistrationOptions('forged-ticket')).rejects.toThrow(/expired/);

    aPass = await sessions.create(A.person, 'passkey');
    aFace = await sessions.create(A.person, 'face');
    bPass = await sessions.create(B.person, 'passkey');
    pA = await verify(aPass.token);
    pAFace = await verify(aFace.token);
    pB = await verify(bPass.token);
    expect([pA.personId, pAFace.method, pB.personId]).toEqual([A.person.id, 'face', B.person.id]);
  });

  it('rejects forged platform events; indexes real ones with flags from real state', async () => {
    await expect(R.memory.ingestMemory(pA, 'VERIFICATION_SUCCEEDED', 'Identity verified via face')).rejects.toThrow(
      /Unsupported memory type/,
    );
    await R.memory.ingestMemory(
      pA,
      'NOTE_CREATED',
      'Studied CRDT merge semantics for the Atlas sync engine',
      JSON.stringify({ skills: ['CRDT'], project: 'Atlas' }),
    );
    const memories = await eventually(
      () => R.memory.myMemories(pA, 50),
      (ms: any[]) => ms[0]?.vectorIndexed && ms[0]?.graphSynced,
    );
    expect(memories).toHaveLength(1);
    expect(memories[0]).toMatchObject({ vectorIndexed: true, graphSynced: true });
  });

  it('isolates memories, semantic search, twin and graph between people', async () => {
    expect(await R.memory.myMemories(pB, 50)).toEqual([]);

    const aSearch = await R.memory.searchMemories(pA, 'CRDT merge semantics', 8);
    expect(aSearch.status).toBe('ok');
    expect(aSearch.items.length).toBeGreaterThan(0);
    expect(aSearch.items.every((m: any) => m.personId === A.person.id && typeof m.score === 'number')).toBe(true);
    await expect(R.memory.searchMemories(pB, 'CRDT merge semantics', 8)).resolves.toMatchObject({ status: 'ok', items: [] });

    const aGraph = await R.knowledge.knowledgeGraph(pA, undefined);
    expect(aGraph.status).toBe('ok');
    expect(aGraph.nodes.map((n: any) => n.label)).toEqual(expect.arrayContaining(['CRDT', 'Atlas']));
    const bGraph = await R.knowledge.knowledgeGraph(pB, undefined);
    expect(bGraph.nodes.map((n: any) => n.label)).not.toContain('CRDT');
    await expect(R.knowledge.knowledgeGraphAvailable()).resolves.toBe(true);

    const aTwin = await eventually(() => R.identity.myTwin(pA), (t: any) => t.skills.length > 0);
    expect(aTwin.skills.map((s: any) => s.name)).toEqual(['CRDT']);
    expect((await R.identity.myTwin(pB)).skills).toEqual([]);
  });

  it('uploads to real Qdrant (UUID point ids) and cites genuine document ids and chunk indexes', async () => {
    const file = (name: string, text: string) => ({
      originalname: name,
      mimetype: 'text/markdown',
      size: text.length,
      buffer: Buffer.from(text),
    });
    const aDoc = await R.ragService.uploadDocument(A.person.id, file('crdt.md', '# CRDTs\nCRDTs merge concurrent edits without coordination.'));
    const bDoc = await R.ragService.uploadDocument(B.person.id, file('bob.md', '# Bob\nCRDTs merge concurrent edits in Bob private notes.'));
    expect([aDoc.status, bDoc.status]).toEqual(['indexed', 'indexed']);

    const res = await R.rag.askYourKnowledge(pA, 'how do CRDTs merge concurrent edits');
    expect(res).toMatchObject({ status: 'ok', generated: true, citedSourceIndexes: [1], invalidCitations: [9] });
    expect(res.sources.length).toBeGreaterThan(0);
    expect(res.sources.every((s: any) => s.documentId === aDoc.id && Number.isInteger(s.chunkIndex))).toBe(true);

    expect((await R.rag.myDocuments(pB)).map((d: any) => d.id)).toEqual([bDoc.id]);
    const bHits = await R.rag.searchKnowledge(pB, 'CRDTs merge concurrent edits', 5);
    expect(bHits.every((h: string) => h.startsWith('[bob.md]'))).toBe(true);
  });

  it('copilot reports tool outcomes and cites only the caller\'s records', async () => {
    const msg = await R.copilot.askCopilot(pA, 'find documents about CRDT merge', 'research');
    expect(msg).toMatchObject({ agentId: 'research', routing: 'explicit', generated: true });
    expect(msg.toolCalls.length).toBeGreaterThan(0);
    for (const t of msg.toolCalls) {
      expect(['ok', 'empty', 'unavailable', 'error']).toContain(t.status);
      expect(t.durationMs).toBeGreaterThanOrEqual(0);
    }
    expect(msg.sources.length).toBeGreaterThan(0);
    msg.sources.forEach((s: any, i: number) => expect(s.index).toBe(i + 1));
    const memIds = (await R.memory.myMemories(pA, 50)).map((m: any) => m.id);
    const docIds = (await R.rag.myDocuments(pA)).map((d: any) => d.id);
    for (const s of msg.sources) {
      if (s.kind === 'memory') expect(memIds).toContain(s.refId);
      if (s.kind === 'document') expect(docIds).toContain(s.refId);
    }
    const catalog = R.copilot.agentCatalog();
    expect(catalog.find((a: any) => a.id === 'research').tools).toEqual(['rag_search', 'memory_search']);
  });

  it('enforces face safeguards and reports the unreachable Trust Service', async () => {
    await expect(R.auth.enrollFace(pAFace, 'aGVsbG8=', true)).rejects.toThrow(/requires a session started with your passkey/);
    await expect(R.auth.enrollFace(pA, 'aGVsbG8=', true)).rejects.toThrow(/Trust Service/);
    await expect(R.trust.myTrustProfile(pA)).resolves.toMatchObject({ faceEnrolled: false });

    await expect(R.auth.loginWithFace(meta, 'nobody@it.example.com', FRAMES)).rejects.toThrow(/did not succeed/);
    await expect(R.auth.loginWithFace(meta, A.person.email, ['single-photo'])).rejects.toThrow(/between 8 and 30 frames/);
  });

  it('keeps goals on the caller\'s twin and returns honest insights', async () => {
    const twin = await R.memory.setGoal(pA, 'Ship Atlas sync', undefined);
    expect(twin.goals.map((g: any) => [g.title, g.status])).toEqual([['Ship Atlas sync', 'active']]);
    expect((await R.identity.myTwin(pB)).goals).toEqual([]);

    const insights = await R.insights.myInsights(pA);
    expect(insights.length).toBeGreaterThan(0);
    for (const i of insights) {
      expect(['rule', 'generated']).toContain(i.basis);
      expect(i.confidence).toBeNull();
    }
  });

  it('revokes sessions immediately; one person cannot revoke another\'s', async () => {
    await expect(R.auth.revokeSession(pB, aFace.sessionId)).resolves.toBe(false);
    const list = await R.auth.mySessions(pA);
    expect(list.map((s: any) => s.id).sort()).toEqual([aPass.sessionId, aFace.sessionId].sort());
    expect(list.find((s: any) => s.id === aPass.sessionId).current).toBe(true);

    await expect(R.auth.logout(pA)).resolves.toBe(true);
    await expect(verify(aPass.token)).rejects.toThrow(/signed out/);
    await expect(verify(aFace.token)).resolves.toMatchObject({ personId: A.person.id });
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
});

const httpReady = enabled && apolloExpressResolvable();
if (enabled && !httpReady) {
  // eslint-disable-next-line no-console
  console.warn(
    'Tier 2 (HTTP/GraphQL) BLOCKED and SKIPPED: @nestjs/apollo cannot resolve "@as-integrations/express5" ' +
      '(missing from package-lock.json), so the GraphQL HTTP server cannot start.',
  );
}

(httpReady ? describe : describe.skip)('Tier 2 — HTTP/GraphQL transport', () => {
  let app: INestApplication;

  beforeAll(async () => {
    if (!stub) await configureEnv();
    const { NestFactory } = await import('@nestjs/core');
    const { AppModule } = await import('../src/app.module');
    app = await NestFactory.create(AppModule, { logger: ['error'] });
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    stub?.close();
  });

  it('serves GraphQL where the web client calls it and requires a session', async () => {
    const res = await request(app.getHttpServer()).post('/api/graphql').send({ query: '{ me { id } }' });
    expect(res.status).toBe(200);
    expect(res.body.errors?.[0]?.message).toMatch(/Missing bearer token/);
  });
});
