import { Injectable, Logger } from '@nestjs/common';

import { LlmClient } from '../ai/llm.client';
import { newId } from '../common/ids';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { MemoryService } from '../memory/memory.service';
import { TwinService } from '../twin/twin.service';

export interface InsightDto {
  id: string;
  personId: string;
  kind: 'prediction' | 'recommendation' | 'summary' | 'alert';
  title: string;
  body: string;
  confidence: number;
  evidence: Array<{ label: string; detail: string }>;
  observedFacts: string[];
  createdAt: string;
}

/**
 * Predictive intelligence. Deterministic signals first (never hallucinated),
 * then an optional LLM narrative pass for readability. Every insight exposes
 * the observed facts and evidence behind it — explainable AI as a product
 * principle, not a bolt-on.
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
    const twin = await this.twins.getTwin(personId);
    const events = await this.memory.listEvents(personId, 100);
    const graph = await this.knowledge.getGraph(personId, 80);

    const insights: InsightDto[] = [];
    const observedFacts = this.observedFacts(twin, events, graph);

    // ── 1. Skill growth prediction ──────────────────────────────────────────
    const growing = [...twin.skills].sort((a, b) => b.evidenceCount - a.evidenceCount).slice(0, 3);
    if (growing.length > 0) {
      const pace = this.skillPace(growing[0]);
      insights.push({
        id: newId('ins'),
        personId,
        kind: 'prediction',
        title: 'Skill trajectory',
        body:
          `Your fastest-growing skill is "${growing[0].name}" (${Math.round(growing[0].level * 100)}% ` +
          `proficiency across ${growing[0].evidenceCount} evidence events). At current pace ${pace}.`,
        confidence: 0.82,
        evidence: growing.map((s) => ({
          label: s.name,
          detail: `${s.evidenceCount} evidence events, last observed ${new Date(s.lastObserved).toLocaleDateString()}`,
        })),
        observedFacts,
        createdAt: new Date().toISOString(),
      });
    }

    // ── 2. Knowledge gap / learning recommendation ──────────────────────────
    if (twin.skills.length >= 2) {
      const weakest = [...twin.skills].sort((a, b) => a.level - b.level)[0];
      insights.push({
        id: newId('ins'),
        personId,
        kind: 'recommendation',
        title: 'Recommended focus',
        body:
          `"${weakest.name}" has the lowest observed proficiency (${Math.round(weakest.level * 100)}%) ` +
          `despite ${weakest.evidenceCount} event(s). A focused session here would rebalance your profile faster than adding new skills.`,
        confidence: 0.71,
        evidence: [{ label: weakest.name, detail: `${weakest.evidenceCount} evidence events` }],
        observedFacts,
        createdAt: new Date().toISOString(),
      });
    }

    // ── 3. Momentum / learning speed ────────────────────────────────────────
    if (twin.stats.interactions > 0) {
      const perDay = (twin.stats.interactions / Math.max(1, twin.stats.daysActive)).toFixed(1);
      insights.push({
        id: newId('ins'),
        personId,
        kind: 'summary',
        title: 'Momentum',
        body:
          `You average ${perDay} documented interactions per active day across ` +
          `${twin.stats.daysActive} day(s) — ${twin.stats.memories} memories, ` +
          `${twin.stats.documents} documents, ${twin.stats.projects} projects.`,
        confidence: 0.9,
        evidence: [
          { label: 'Activity stats', detail: `${twin.stats.interactions} total interactions` },
        ],
        observedFacts,
        createdAt: new Date().toISOString(),
      });
    }

    // ── 4. Collaboration signal from the graph ──────────────────────────────
    const people = graph.nodes.filter((n) => n.type === 'Person');
    const projectNames = graph.nodes.filter((n) => n.type === 'Project').map((n) => n.label);
    if (projectNames.length > 0) {
      insights.push({
        id: newId('ins'),
        personId,
        kind: 'recommendation',
        title: 'Collaboration surface',
        body:
          `Your graph shows ${projectNames.length} project(s) and ${people.length} connected people. ` +
          `Re-engaging with "${projectNames[0]}" would likely produce the highest-value next interaction.`,
        confidence: 0.66,
        evidence: projectNames.slice(0, 4).map((p) => ({ label: p, detail: 'project node in galaxy' })),
        observedFacts,
        createdAt: new Date().toISOString(),
      });
    }

    // ── 5. LLM narrative (optional — degraded gracefully) ───────────────────
    try {
      const narrative = await this.narrative(twin, observedFacts);
      insights.unshift({
        id: newId('ins'),
        personId,
        kind: 'summary',
        title: 'Who you are becoming',
        body: narrative,
        confidence: 0.75,
        evidence: [],
        observedFacts,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      this.logger.debug(`Narrative pass skipped: ${(err as Error).message}`);
    }

    return insights.slice(0, 6);
  }

  private observedFacts(twin: any, events: any[], graph: any): string[] {
    const facts = [
      `${twin.skills.length} skill(s) tracked`,
      `${twin.goals.length} active goal(s)`,
      `${twin.stats.interactions} interactions recorded`,
    ];
    if (events[0]) {
      facts.push(`Most recent event: ${events[0].summary.slice(0, 60)}`);
    }
    if (graph.nodes.length > 0) {
      facts.push(`${graph.nodes.length} nodes in the knowledge galaxy`);
    }
    return facts;
  }

  private skillPace(skill: { evidenceCount: number }): string {
    if (skill.evidenceCount >= 5) return 'you are in a compounding growth phase';
    if (skill.evidenceCount >= 2) return 'consistent practice is compounding';
    return 'early-stage; more evidence will firm up this signal';
  }

  private async narrative(
    twin: any,
    facts: string[],
  ): Promise<string> {
    return this.llm.chat(
      'You write short, warm, precise "who you are becoming" narratives for a digital twin product. Max 60 words. Never invent facts.',
      `Skills: ${twin.skills.map((s: any) => s.name).join(', ') || 'none'}\nGoals: ${twin.goals
        .map((g: any) => g.title)
        .join(', ') || 'none'}\nObserved facts: ${facts.join('; ')}`,
      { temperature: 0.7, maxTokens: 140 },
    );
  }
}
