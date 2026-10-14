import type { GraphSnapshotDto } from '../knowledge/knowledge.service';
import { KnowledgeResolver } from '../knowledge/knowledge.resolver';
import { statementsForEvent } from '../knowledge/graph-mapping';
import type { TwinEntity } from '../twin/twin.entity';
import { buildRuleInsights, InsightsService } from './insights.service';

const emptyTwin = (): TwinEntity =>
  ({ id: 't', personId: 'p', version: 1, skills: [], goals: [], interests: [], narrative: '', stats: {} } as unknown as TwinEntity);

const graph = (status: 'ok' | 'unavailable', nodes: GraphSnapshotDto['nodes'] = []): GraphSnapshotDto => ({
  status,
  nodes,
  edges: [],
  truncated: false,
  generatedAt: 'now',
});

describe('Insights', () => {
  it('returns nothing (and never calls the model) when there is no evidence', async () => {
    const llm = { chat: jest.fn(async () => 'You are a visionary.') };
    const svc = new InsightsService(
      { getTwin: async () => emptyTwin() } as never,
      { listEvents: async () => [] } as never,
      { getGraph: async () => graph('ok') } as never,
      llm as never,
    );
    await expect(svc.generate('p')).resolves.toEqual([]);
    expect(llm.chat).not.toHaveBeenCalled();
  });

  it('labels every rule insight with basis=rule and no confidence', () => {
    const twin = emptyTwin();
    twin.skills = [
      { name: 'TypeScript', level: 0.5, evidenceCount: 4, lastObserved: '2026-10-10T00:00:00.000Z' },
      { name: 'Rust', level: 0.25, evidenceCount: 1, lastObserved: '2026-10-01T00:00:00.000Z' },
    ];
    twin.stats = { memories: 5, documents: 0, projects: 1, interactions: 5, daysActive: 2 };
    const insights = buildRuleInsights('p', twin, [], graph('ok'));
    expect(insights.length).toBeGreaterThan(0);
    for (const i of insights) {
      expect(i.basis).toBe('rule');
      expect(i.confidence).toBeNull();
      expect(i.evidence.length).toBeGreaterThan(0);
    }
    expect(insights.map((i) => i.title)).toEqual(['Most-practised skill', 'Least-practised skill', 'Recorded activity']);
  });

  it('labels the model-written summary as generated', async () => {
    const twin = emptyTwin();
    twin.stats = { memories: 1, documents: 0, projects: 0, interactions: 1, daysActive: 1 };
    const svc = new InsightsService(
      { getTwin: async () => twin } as never,
      { listEvents: async () => [] } as never,
      { getGraph: async () => graph('ok') } as never,
      { chat: async () => 'One recorded interaction so far.' } as never,
    );
    const [first] = await svc.generate('p');
    expect(first).toMatchObject({ basis: 'generated', confidence: null, body: 'One recorded interaction so far.' });
  });

  it('omits graph observations when the graph is unavailable and says so', () => {
    const twin = emptyTwin();
    twin.stats = { memories: 1, documents: 0, projects: 0, interactions: 1, daysActive: 1 };
    const insights = buildRuleInsights('p', twin, [], graph('unavailable'));
    expect(insights.some((i) => i.title === 'Projects in your graph')).toBe(false);
    expect(insights[0].observedFacts).toContain('Knowledge graph unavailable — graph-based observations omitted');
  });
});

describe('Knowledge graph', () => {
  it('passes unavailable status through rather than presenting an empty graph as data', async () => {
    const resolver = new KnowledgeResolver({ getGraph: async () => graph('unavailable') } as never);
    await expect(
      resolver.knowledgeGraph({ personId: 'p', email: 'e', sessionId: 's', method: 'passkey' }, undefined),
    ).resolves.toMatchObject({ status: 'unavailable', nodes: [], truncated: false });
  });

  it('scopes every owned node it writes to the person (no global MERGE by name)', () => {
    const statements = statementsForEvent('person_a', {
      type: 'PROJECT_UPDATE',
      summary: 'x',
      payload: { project: 'Atlas', skills: ['Go'], collaboratorName: 'Sam', memoryId: 'm1' },
    });
    expect(statements.length).toBeGreaterThan(0);
    for (const s of statements) {
      expect(s.params.person).toBe('person_a');
      expect(s.cypher).toMatch(/ownerId: \$person/);
      // Relationship variables may only be used after the MERGE that binds them (Neo4j rejects it otherwise).
      const bindAt = s.cypher.search(/MERGE \(p\)-\[r:/);
      const firstUse = s.cypher.search(/\br\./);
      if (firstUse >= 0) expect(bindAt).toBeGreaterThanOrEqual(0);
      if (firstUse >= 0) expect(firstUse).toBeGreaterThan(bindAt);
    }
  });
});
