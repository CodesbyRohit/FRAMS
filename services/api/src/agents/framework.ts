import { Logger } from '@nestjs/common';

import { LlmClient } from '../ai/llm.client';
import type { AgentId } from '@anima/shared';

export interface AgentSource {
  label: string;
  snippet: string;
}

export interface ToolCallRecord {
  tool: string;
  args: string;
  result?: string;
  error?: string;
}

export interface AgentContext {
  personId: string;
  displayName: string;
}

export interface AgentTool {
  name: string;
  description: string;
  /** Execute the tool. Returns a human-readable summary plus citations. */
  run(ctx: AgentContext, args: string): Promise<{ summary: string; sources: AgentSource[] }>;
}

export interface AgentRunResult {
  content: string;
  agentId: AgentId;
  toolCalls: ToolCallRecord[];
  sources: AgentSource[];
}

export interface AgentSpec {
  id: AgentId;
  name: string;
  description: string;
  keywords: string[];
  systemPrompt: string;
  toolNames: string[];
}

const logger = new Logger('AgentFramework');

/**
 * Minimal agent runtime: an agent owns a system prompt and a set of tools.
 * The run loop gathers evidence by executing its tools against the user's
 * message, then the LLM composes the answer. Tool results are surfaced as
 * sources and a visible chain of thought — no hidden reasoning.
 */
export class Agent {
  constructor(
    private readonly spec: AgentSpec,
    private readonly tools: Map<string, AgentTool>,
    private readonly llm: LlmClient,
  ) {}

  get id(): AgentId {
    return this.spec.id;
  }

  get specInfo(): AgentSpec {
    return this.spec;
  }

  keywordScore(message: string): number {
    const lower = message.toLowerCase();
    return this.spec.keywords.reduce((score, kw) => (lower.includes(kw) ? score + 1 : score), 0);
  }

  async run(userMessage: string, ctx: AgentContext): Promise<AgentRunResult> {
    const lower = userMessage.toLowerCase();
    const toolCalls: ToolCallRecord[] = [];
    const sources: AgentSource[] = [];

    const candidates = this.spec.toolNames
      .map((name) => this.tools.get(name))
      .filter((tool): tool is AgentTool => !!tool);

    // Execute the most relevant tools (by description overlap with the query).
    const relevant = candidates
      .map((tool) => ({ tool, score: this.descriptionOverlap(tool, lower) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    for (const { tool } of relevant) {
      try {
        const result = await tool.run(ctx, userMessage);
        toolCalls.push({ tool: tool.name, args: userMessage.slice(0, 160), result: result.summary.slice(0, 400) });
        sources.push(...result.sources);
      } catch (err) {
        toolCalls.push({ tool: tool.name, args: userMessage.slice(0, 160), error: (err as Error).message });
      }
    }

    const evidence = sources
      .map((s) => `- ${s.label}: ${s.snippet.slice(0, 240)}`)
      .join('\n');
    const toolLog = toolCalls
      .map((t) => `# ${t.tool}${t.error ? ` → failed: ${t.error}` : ''}`)
      .join('\n');

    const user = [
      `Persona: ${ctx.displayName}.`,
      `\nQuestion: ${userMessage}`,
      evidence ? `\nEvidence gathered:\n${evidence}` : '\nNo external evidence was retrieved.',
      `\nTool chain:\n${toolLog}`,
    ].join('\n');

    let content: string;
    try {
      content = await this.llm.chat(this.spec.systemPrompt, user, { temperature: 0.4, maxTokens: 700 });
    } catch (err) {
      logger.warn(`LLM unavailable for agent ${this.spec.id}: ${(err as Error).message}`);
      content = this.deterministicAnswer(userMessage, evidence, toolCalls);
    }

    return { content, agentId: this.spec.id, toolCalls, sources };
  }

  /** Honest fallback when no model is configured — grounded purely in evidence. */
  private deterministicAnswer(message: string, evidence: string, calls: ToolCallRecord[]): string {
    const lines = [
      `I'm ${this.spec.name}, your ${this.spec.description.toLowerCase()}.`,
      calls.length > 0
        ? `I consulted ${calls.length} source(s) of your data for this question.`
        : 'No relevant data sources were available for this question.',
      evidence ? `\nWhat I found:\n${evidence}` : '',
      '\n(Note: an LLM is not configured yet — ANIMA_LLM_BASE_URL/ANIMA_LLM_API_KEY. This answer is assembled from your twin\'s data alone.)',
    ];
    return lines.filter(Boolean).join('\n');
  }

  private descriptionOverlap(tool: AgentTool, lower: string): number {
    const words = tool.description.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    return words.reduce((n, w) => (lower.includes(w) ? n + 1 : n), 0);
  }
}
