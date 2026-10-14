import { Injectable, Logger } from '@nestjs/common';

import { LlmClient } from '../ai/llm.client';
import { newId } from '../common/ids';
import type { GraphSnapshotDto } from '../knowledge/knowledge.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { MemoryService } from '../memory/memory.service';
import type { MemoryEventEntity } from '../memory/memory-event.entity';
import type { TwinEntity } from '../twin/twin.entity';
import { statsOf, TwinService } from '../twin/twin.service';

export interface InsightEvidence {
  type: 'skill' | 'stat' | 'graph' | 'memory_event';
  refId: string | null;
  label: string;
  detail: string;
}

export interface InsightDto {
  id: string;
  personId: string;
  kind: 'recommendation' | 'summary' | 'observation';
  title: string;
  body: string;
  /** rule = computed from the person's data by a fixed rule; generated = written by a language model. */
  basis: 'rule' | 'generated';
  /** No calibrated confidence model exists, so none is reported. */
  confidence: null;
  evidence: InsightEvidence[];
  observedFacts: string[];
  createdAt: string;
}

/**
 * Insights are deterministic observations over the person's own data, each
 * with the evidence behind it. Nothing is predicted and no confidence is
 * invented. An optional model-written summary is labelled `generated` and is
 * only produced when there is data to summarize. No data → no insights.
 */
@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  constructor(
    private readonly twins: TwinService,
    private readonly memory: MemoryService,
    private readonly knowledge: KnowledgeService,
    private readonly llm: LlmClient,
  ) {}

  async generate(personId: string): Promise<InsightDto[]> {
    const [twin, events, graph] = await Promise.all([
      this.twins.getTwin(personId),
      this.memory.listEvents(personId, 100),
      this.knowledge.getGraph(personId, 80),
    ]);
    const insights = buildRuleInsights(personId, twin, events, graph);
    if (insights.length === 0) {
      return [];
    }

    const facts = insights[0].observedFacts;
    try {
      const narrative = await this.llm.chat(
        'Write a short, plain summary (max 60 words) of this person\'s recorded activity. ' +
          'Use only the facts given. Do not predict, score, or invent anything.',
        `Skills: ${twin.skills.map((s) => s.name).join(', ') || 'none'}\nGoals: ${
          twin.goals.map((g) => g.title).join(', ') || 'none'
        }\nObserved facts: ${facts.join('; ')}`,
        { temperature: 0.3, maxTokens: 140 },
      );
      insights.unshift({
        id: newId('ins'),
        personId,
        kind: 'summary',
        title: 'Summary of your record',
        body: narrative,
        basis: 'generated',
        confidence: null,
        evidence: [],
        observedFacts: facts,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      this.logger.debug(`Generated summary skipped: ${(err as Error).message}`);
    }
    return insights.slice(0, 6);
  }
}

/** Pure rule pass (unit-tested). Returns [] when the person has no recorded evidence. */
export function buildRuleInsights(
  personId: string,
  twin: TwinEntity,
  events: MemoryEventEntity[],
  graph: GraphSnapshotDto,
): InsightDto[] {
  const stats = statsOf(twin);
  const facts = observedFacts(twin, stats, events, graph);
  const now = new Date().toISOString();
  const make = (i: Omit<InsightDto, 'id' | 'personId' | 'basis' | 'confidence' | 'observedFacts' | 'createdAt'>): InsightDto => ({
    id: newId('ins'),
    personId,
    basis: 'rule',
    confidence: null,
    observedFacts: facts,
    createdAt: now,
    ...i,
  });
  const out: InsightDto[] = [];

  // 1. Most-practised skills (by number of recorded practice events).
  const practised = [...twin.skills].sort((a, b) => b.evidenceCount - a.evidenceCount).slice(0, 3);
  if (practised.length > 0) {
    const top = practised[0];
    out.push(
      make({
        kind: 'observation',
        title: 'Most-practised skill',
        body: `"${top.name}" has the most recorded practice: ${top.evidenceCount} event(s), most recently on ${top.lastObserved.slice(0, 10)}.`,
        evidence: practised.map((s) => ({
          type: 'skill',
          refId: null,
          label: s.name,
          detail: `${s.evidenceCount} practice event(s), last ${s.lastObserved.slice(0, 10)}`,
        })),
      }),
    );
  }

  // 2. Least-practised skill (only meaningful with at least two skills).
  if (twin.skills.length >= 2) {
    const least = [...twin.skills].sort((a, b) => a.evidenceCount - b.evidenceCount)[0];
    out.push(
      make({
        kind: 'recommendation',
        title: 'Least-practised skill',
        body: `"${least.name}" has the fewest recorded practice events (${least.evidenceCount}). If it matters to you, recording practice there will show up here.`,
        evidence: [{ type: 'skill', refId: null, label: least.name, detail: `${least.evidenceCount} practice event(s)` }],
      }),
    );
  }

  // 3. Activity totals.
  if (stats.interactions > 0) {
    const perDay = stats.daysActive > 0 ? ` (${(stats.interactions / stats.daysActive).toFixed(1)} per active day)` : '';
    out.push(
      make({
        kind: 'summary',
        title: 'Recorded activity',
        body:
          `${stats.interactions} recorded interactions over ${stats.daysActive} active day(s)${perDay}: ` +
          `${stats.memories} memories, ${stats.documents} documents, ${stats.projects} project updates.`,
        evidence: [
          { type: 'stat', refId: null, label: 'Interactions', detail: String(stats.interactions) },
          { type: 'stat', refId: null, label: 'Active days', detail: String(stats.daysActive) },
          ...(events[0]
            ? [{ type: 'memory_event' as const, refId: events[0].id, label: 'Most recent event', detail: events[0].summary.slice(0, 80) }]
            : []),
        ],
      }),
    );
  }

  // 4. Projects in the graph (only when the graph actually answered).
  if (graph.status === 'ok') {
    const projects = graph.nodes.filter((n) => n.type === 'Project');
    const contacts = graph.nodes.filter((n) => n.type === 'Contact');
    if (projects.length > 0) {
      out.push(
        make({
          kind: 'observation',
          title: 'Projects in your graph',
          body:
            `Your graph holds ${projects.length} project(s) and ${contacts.length} recorded contact(s). ` +
            `Most recently updated: "${projects[0].label}".`,
          evidence: projects.slice(0, 4).map((p) => ({ type: 'graph', refId: p.id, label: p.label, detail: 'Project' })),
        }),
      );
    }
  }
  return out;
}

function observedFacts(
  twin: TwinEntity,
  stats: { interactions: number },
  events: MemoryEventEntity[],
  graph: GraphSnapshotDto,
): string[] {
  const facts = [
    `${twin.skills.length} skill(s) tracked`,
    `${twin.goals.length} goal(s) declared`,
    `${stats.interactions} interactions recorded`,
  ];
  if (events[0]) {
    facts.push(`Most recent event: ${events[0].summary.slice(0, 60)}`);
  }
  if (graph.status !== 'ok') {
    facts.push('Knowledge graph unavailable — graph-based observations omitted');
  } else {
    facts.push(`${graph.nodes.length} node(s) in the knowledge graph`);
  }
  return facts;
}
