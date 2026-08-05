import { Injectable } from '@nestjs/common';
import type { AgentId } from '@anima/shared';

import { LlmClient } from '../ai/llm.client';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { MemoryService } from '../memory/memory.service';
import { RagService } from '../rag/rag.service';
import { TrustService } from '../trust/trust.service';
import { TwinService } from '../twin/twin.service';
import { Agent, AgentContext, AgentSource, AgentSpec, AgentTool } from './framework';

/**
 * ANIMA Copilot — ten specialized agents, each with its own tools and memory
 * access, routed by intent. The face may be the gateway, but this is the
 * product: an interface that understands you.
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
        description: 'Reports trust posture, bound verification methods and session health.',
        keywords: ['security', 'trust', 'passkey', 'face', 'verify', 'session', 'safe'],
        systemPrompt:
          "You are ANIMA's Security Agent. Report the person's identity trust posture from the trust profile, plainly and reassuringly.",
        toolNames: ['trust_status', 'twin_state'],
      },
    ];

    for (const spec of specs) {
      this.agents.set(spec.id, new Agent(spec, tools, this.llm));
    }
  }

  /** All tools the agents can use. Each returns a summary + citations. */
  private tools(): AgentTool[] {
    const withSources = (label: string, summary: string, extra: AgentSource[] = []): { summary: string; sources: AgentSource[] } => ({
      summary,
      sources: [{ label, snippet: summary.slice(0, 200) }, ...extra],
    });

    const memorySearch: AgentTool = {
      name: 'memory_search',
      description: 'Semantically search the person’s memories and interaction history.',
      run: async (ctx, query) => {
        const rows = await this.memory.searchMemories(ctx.personId, query, 5);
        if (rows.length === 0) {
          return withSources('memory', 'No matching memories found.');
        }
        const summary = rows.map((m) => `• ${m.title}: ${m.content}`).join('\n');
        return withSources('memory', summary, rows.map((m) => ({ label: m.title, snippet: m.content.slice(0, 180) })));
      },
    };

    const knowledgeGraph: AgentTool = {
      name: 'knowledge_graph',
      description: 'Query the knowledge galaxy of people, projects, skills and ideas.',
      run: async (ctx) => {
        const graph = await this.knowledge.getGraph(ctx.personId, 100);
        if (graph.nodes.length === 0) {
          return withSources('knowledge graph', 'The knowledge galaxy is empty (Neo4j may be offline).');
        }
        const people = graph.nodes.filter((n) => n.type === 'Person');
        const projects = graph.nodes.filter((n) => n.type === 'Project');
        const skills = graph.nodes.filter((n) => n.type === 'Skill');
        const summary = `Galaxy contains ${graph.nodes.length} nodes and ${graph.edges.length} connections — ${people.length} people, ${projects.length} projects, ${skills.length} skills.`;
        return withSources('knowledge graph', summary);
      },
    };

    const ragSearch: AgentTool = {
      name: 'rag_search',
      description: 'Search the person’s uploaded documents and answer with citations.',
      run: async (ctx, query) => {
        const result = await this.rag.ask(ctx.personId, query);
        return withSources('documents', result.answer, result.sources.map((s) => ({ label: s.label, snippet: s.snippet })));
      },
    };

    const twinState: AgentTool = {
      name: 'twin_state',
      description: 'Read the current digital twin state: skills, goals, narrative, activity stats.',
      run: async (ctx) => {
        const twin = await this.twins.getTwin(ctx.personId);
        const topSkills = twin.skills
          .sort((a, b) => b.level - a.level)
          .slice(0, 6)
          .map((s) => `${s.name} (${Math.round(s.level * 100)}%)`)
          .join(', ');
        const summary = [
          `Narrative: ${twin.narrative}`,
          `Top skills: ${topSkills || 'none yet'}`,
          `Goals: ${twin.goals.map((g) => `${g.title} (${Math.round(g.progress * 100)}%)`).join(', ') || 'none yet'}`,
          `Interactions: ${twin.stats.interactions}, Memories: ${twin.stats.memories}, Documents: ${twin.stats.documents}`,
        ].join('\n');
        return withSources('digital twin', summary);
      },
    };

    const trustStatus: AgentTool = {
      name: 'trust_status',
      description: 'Read identity trust posture: scores and bound verification methods.',
      run: async (ctx) => {
        const profile = await this.trust.getProfile(ctx.personId);
        const summary = [
          `Identity confidence: ${Math.round(profile.identityScore * 100)}%`,
          `Device posture: ${Math.round(profile.deviceScore * 100)}%`,
          `Behavioral consistency: ${Math.round(profile.behavioralScore * 100)}%`,
          `Bound methods: ${profile.boundMethods.join(', ') || 'none yet'}`,
        ].join('\n');
        return withSources('trust profile', summary);
      },
    };

    return [memorySearch, knowledgeGraph, ragSearch, twinState, trustStatus];
  }

  get catalog(): AgentSpec[] {
    return [...this.agents.values()].map((a) => a.specInfo);
  }

  /** Route the message to the best agent and run it. */
  async ask(personId: string, displayName: string, message: string): Promise<{
    content: string;
    agentId: AgentId;
    toolCalls: Array<{ tool: string; args: string; result?: string; error?: string }>;
    sources: AgentSource[];
  }> {
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
    return result;
  }
}
