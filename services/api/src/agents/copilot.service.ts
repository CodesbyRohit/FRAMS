import { BadRequestException, Injectable } from '@nestjs/common';
import type { AgentId } from '@anima/shared';

import { LlmClient } from '../ai/llm.client';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { MemoryService } from '../memory/memory.service';
import { RagService } from '../rag/rag.service';
import { TrustService } from '../trust/trust.service';
import { EMPTY_NARRATIVE, statsOf, TwinService } from '../twin/twin.service';
import { Agent, AgentContext, AgentRunResult, AgentSpec, AgentTool, ToolResult } from './framework';

/**
 * ANIMA Copilot — ten agent personas over one shared tool set, routed by
 * keyword overlap (or chosen explicitly). Each agent has its own prompt and
 * subset of tools; answers cite the records the tools actually returned.
 */
@Injectable()
export class CopilotService {
  private readonly agents = new Map<AgentId, Agent>();

  constructor(
    private readonly llm: LlmClient,
    private readonly memory: MemoryService,
    private readonly knowledge: KnowledgeService,
    private readonly rag: RagService,
    private readonly twins: TwinService,
    private readonly trust: TrustService,
  ) {
    this.buildAgents();
  }

  private buildAgents(): void {
    const tools = new Map<string, AgentTool>();
    for (const tool of this.tools()) {
      tools.set(tool.name, tool);
    }

    const specs: AgentSpec[] = [
      {
        id: 'identity',
        name: 'Identity Agent',
        description: 'Explains who you are, your strengths and your trajectory from twin data.',
        keywords: ['who am i', 'strengths', 'identity', 'about me', 'myself', 'profile'],
        systemPrompt:
          "You are ANIMA's Identity Agent. Describe the person from their twin: skills, goals, narrative and activity. Be specific and honest, and never invent facts not present in the evidence.",
        toolNames: ['twin_state', 'trust_status'],
      },
      {
        id: 'memory',
        name: 'Memory Agent',
        description: 'Recalls past work, notes, projects and events via semantic memory search.',
        keywords: ['remember', 'memory', 'worked on', 'done', 'past', 'previously', 'recall'],
        systemPrompt:
          "You are ANIMA's Memory Agent. Reconstruct what the person did from retrieved memories. If the evidence is thin, say so.",
        toolNames: ['memory_search', 'twin_state'],
      },
      {
        id: 'research',
        name: 'Research Agent',
        description: 'Answers questions grounded in the person’s document corpus with citations.',
        keywords: ['research', 'document', 'find in', 'read', 'according to', 'knowledge'],
        systemPrompt:
          "You are ANIMA's Research Agent. Answer from the person's corpus only, citing sources inline as [n]. Never invent.",
        toolNames: ['rag_search', 'memory_search'],
      },
      {
        id: 'learning',
        name: 'Learning Agent',
        description: 'Tracks what was learned, learning speed and knowledge gaps.',
        keywords: ['learn', 'learning', 'skills', 'knowledge gap', 'improve', 'grow'],
        systemPrompt:
          "You are ANIMA's Learning Agent. Identify learned skills, gaps and suggested next steps based on twin evidence.",
        toolNames: ['twin_state', 'memory_search', 'rag_search'],
      },
      {
        id: 'productivity',
        name: 'Productivity Agent',
        description: 'Summarizes activity, momentum and focus areas.',
        keywords: ['productive', 'focus', 'momentum', 'activity', 'busy', 'progress'],
        systemPrompt:
          "You are ANIMA's Productivity Agent. Summarize recent activity and momentum from the twin stats.",
        toolNames: ['twin_state', 'memory_search'],
      },
      {
        id: 'creativity',
        name: 'Creativity Agent',
        description: 'Surfaces ideas and connects unrelated memories into new suggestions.',
        keywords: ['idea', 'create', 'invent', 'inspire', 'creative', 'what next'],
        systemPrompt:
          "You are ANIMA's Creativity Agent. Connect the person's memories and ideas into fresh, concrete suggestions.",
        toolNames: ['memory_search', 'knowledge_graph'],
      },
      {
        id: 'networking',
        name: 'Networking Agent',
        description: 'Finds collaborators, connections and shared context from the knowledge graph.',
        keywords: ['collaborate', 'collaborator', 'network', 'team', 'someone', 'together'],
        systemPrompt:
          "You are ANIMA's Networking Agent. Recommend collaborators and connections from the knowledge graph and meeting history.",
        toolNames: ['knowledge_graph', 'memory_search'],
      },
      {
        id: 'knowledge',
        name: 'Knowledge Agent',
        description: 'General-purpose answers across memories, documents and the graph.',
        keywords: ['tell me', 'explain', 'summary', 'summarize', 'everything', 'overview'],
        systemPrompt:
          "You are ANIMA's Knowledge Agent. Answer broadly across the person's memories, documents and relationships. Cite what you used.",
        toolNames: ['memory_search', 'rag_search', 'knowledge_graph'],
      },
      {
        id: 'planner',
        name: 'Planner Agent',
        description: 'Recommends next projects and plans based on goals and momentum.',
        keywords: ['plan', 'next project', 'recommend', 'roadmap', 'strategy', 'schedule'],
        systemPrompt:
          "You are ANIMA's Planner Agent. Recommend concrete next steps and projects aligned with the person's goals and momentum.",
        toolNames: ['twin_state', 'knowledge_graph'],
      },
      {
        id: 'security',
        name: 'Security Agent',
        description: 'Reports bound sign-in methods, face enrollment and verification history.',
        keywords: ['security', 'trust', 'passkey', 'face', 'verify', 'session', 'safe'],
        systemPrompt:
          "You are ANIMA's Security Agent. Report the person's sign-in methods and verification history from the trust profile, plainly. Never state scores or percentages that are not in the evidence.",
        toolNames: ['trust_status', 'twin_state'],
      },
    ];

    for (const spec of specs) {
      this.agents.set(spec.id, new Agent(spec, tools, this.llm));
    }
  }

  /** All tools the agents can use. Each reports its outcome; only real records become sources. */
  private tools(): AgentTool[] {
    const memorySearch: AgentTool = {
      name: 'memory_search',
      description: 'Semantically search the person’s memories and interaction history.',
      run: async (ctx, query): Promise<ToolResult> => {
        const result = await this.memory.searchMemories(ctx.personId, query, 5);
        const pending =
          result.unindexedCount > 0 ? ` ${result.unindexedCount} memories are not yet searchable by meaning.` : '';
        if (result.status !== 'ok') {
          return { status: 'unavailable', summary: (result.message ?? 'Semantic search is unavailable.') + pending, sources: [] };
        }
        if (result.items.length === 0) {
          return { status: 'empty', summary: `No matching memories found.${pending}`, sources: [] };
        }
        return {
          status: 'ok',
          summary: `${result.items.length} matching memories.${pending}`,
          sources: result.items.map((m) => ({
            kind: 'memory' as const,
            label: m.title,
            snippet: m.content.slice(0, 240),
            refId: m.id,
            score: Math.round(m.score * 1000) / 1000,
          })),
        };
      },
    };

    const knowledgeGraph: AgentTool = {
      name: 'knowledge_graph',
      description: 'Query the knowledge galaxy of contacts, projects, skills and ideas.',
      run: async (ctx): Promise<ToolResult> => {
        const graph = await this.knowledge.getGraph(ctx.personId, 100);
        if (graph.status !== 'ok') {
          return { status: 'unavailable', summary: 'The knowledge graph (Neo4j) is unavailable.', sources: [] };
        }
        // The person's own root node alone is not knowledge.
        const owned = graph.nodes.filter((n) => n.type !== 'Person');
        if (owned.length === 0) {
          return { status: 'empty', summary: 'The knowledge graph has no entries yet.', sources: [] };
        }
        const parts = ['Project', 'Skill', 'Contact', 'Idea', 'Goal', 'Meeting']
          .map((type) => {
            const list = owned.filter((n) => n.type === type).map((n) => n.label);
            return list.length > 0 ? `${type}s (${list.length}): ${list.slice(0, 8).join(', ')}` : '';
          })
          .filter(Boolean);
        const snippet =
          `${owned.length} entries and ${graph.edges.length} connections${graph.truncated ? ' (partial view)' : ''}. ` +
          parts.join('; ');
        return {
          status: 'ok',
          summary: snippet.slice(0, 400),
          sources: [{ kind: 'graph', label: 'Knowledge graph', snippet }],
        };
      },
    };

    const ragSearch: AgentTool = {
      name: 'rag_search',
      description: 'Search the person’s uploaded documents for relevant passages.',
      run: async (ctx, query): Promise<ToolResult> => {
        const result = await this.rag.searchDocuments(ctx.personId, query, 5);
        if (result.status !== 'ok') {
          return { status: 'unavailable', summary: result.message ?? 'Document search is unavailable.', sources: [] };
        }
        if (result.hits.length === 0) {
          return { status: 'empty', summary: 'No matching passages in your documents.', sources: [] };
        }
        return {
          status: 'ok',
          summary: `${result.hits.length} matching passages.`,
          sources: result.hits.map((h) => ({
            kind: 'document' as const,
            label: h.title,
            snippet: h.content.slice(0, 240),
            refId: h.documentId,
            chunkIndex: h.chunkIndex,
            score: Math.round(h.score * 1000) / 1000,
          })),
        };
      },
    };

    const twinState: AgentTool = {
      name: 'twin_state',
      description: 'Read the current digital twin state: skills, goals, narrative, activity stats.',
      run: async (ctx): Promise<ToolResult> => {
        const twin = await this.twins.getTwin(ctx.personId);
        const stats = statsOf(twin);
        const hasData = twin.skills.length > 0 || twin.goals.length > 0 || stats.interactions > 0;
        if (!hasData) {
          return { status: 'empty', summary: 'The digital twin has no recorded skills, goals or activity yet.', sources: [] };
        }
        const topSkills = [...twin.skills]
          .sort((a, b) => b.evidenceCount - a.evidenceCount)
          .slice(0, 6)
          .map((s) => `${s.name} (${s.evidenceCount} practice event(s))`)
          .join(', ');
        const goals = twin.goals
          .map((g) => `${g.title} (${g.status}, ${Math.round(g.progress * 100)}% reported)`)
          .join(', ');
        const snippet = [
          twin.narrative && twin.narrative !== EMPTY_NARRATIVE ? `Narrative: ${twin.narrative}` : '',
          `Skills: ${topSkills || 'none recorded'}`,
          `Goals: ${goals || 'none'}`,
          `Activity: ${stats.interactions} interactions, ${stats.memories} memories, ${stats.documents} documents over ${stats.daysActive} active day(s)`,
        ]
          .filter(Boolean)
          .join('\n');
        return {
          status: 'ok',
          summary: 'Read the digital twin.',
          sources: [{ kind: 'twin', label: 'Digital twin', snippet, refId: twin.id }],
        };
      },
    };

    const trustStatus: AgentTool = {
      name: 'trust_status',
      description: 'Read verification facts: bound sign-in methods, face enrollment and the last verification.',
      run: async (ctx): Promise<ToolResult> => {
        const profile = await this.trust.getProfile(ctx.personId);
        const snippet = [
          `Bound sign-in methods: ${profile.boundMethods.join(', ') || 'none'}`,
          `Face sign-in: ${profile.faceEnrolled ? 'enrolled' : 'not enrolled'}`,
          profile.lastVerifiedAt
            ? `Last verification: ${profile.lastVerificationMethod ?? 'unknown method'} at ${new Date(profile.lastVerifiedAt).toISOString()}`
            : 'No verification recorded yet',
          'ANIMA does not measure device posture or behaviour and reports no trust score.',
        ].join('\n');
        return {
          status: 'ok',
          summary: 'Read the trust profile.',
          sources: [{ kind: 'trust', label: 'Trust profile', snippet }],
        };
      },
    };

    return [memorySearch, knowledgeGraph, ragSearch, twinState, trustStatus];
  }

  get catalog(): AgentSpec[] {
    return [...this.agents.values()].map((a) => a.specInfo);
  }

  /** Route the message to the requested agent, or the best keyword match, and run it. */
  async ask(
    personId: string,
    displayName: string,
    message: string,
    agentId?: AgentId,
  ): Promise<AgentRunResult & { routing: 'explicit' | 'keyword' | 'default' }> {
    if (agentId) {
      const chosen = this.agents.get(agentId);
      if (!chosen) {
        throw new BadRequestException(`Unknown agent "${agentId}".`);
      }
      return { ...(await chosen.run(message, { personId, displayName })), routing: 'explicit' };
    }
    let best = this.agents.get('knowledge')!;
    let bestScore = 0;
    for (const agent of this.agents.values()) {
      const score = agent.keywordScore(message);
      if (score > bestScore) {
        best = agent;
        bestScore = score;
      }
    }
    const result = await best.run(message, { personId, displayName } satisfies AgentContext);
    return { ...result, routing: bestScore > 0 ? 'keyword' : 'default' };
  }
}
