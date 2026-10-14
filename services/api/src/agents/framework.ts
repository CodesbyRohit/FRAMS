import { Logger } from '@nestjs/common';

import { AiUnavailableError, describeAiFailure } from '../ai/ai-error';
import { checkCitations, fenceUntrusted } from '../ai/citations';
import { LlmClient } from '../ai/llm.client';
import type { AgentId } from '@anima/shared';

export type SourceKind = 'memory' | 'document' | 'twin' | 'graph' | 'trust';

/** A record the answer may cite. Only real data becomes a source — never a tool status line. */
export interface AgentSource {
  kind: SourceKind;
  label: string;
  snippet: string;
  /** Memory id or document id, when the source is linkable. */
  refId?: string | null;
  chunkIndex?: number | null;
  score?: number | null;
}

/** A source after numbering: `index` is the [n] the answer uses to cite it. */
export interface IndexedSource extends AgentSource {
  index: number;
}

export type ToolStatus = 'ok' | 'empty' | 'unavailable' | 'error';

export interface ToolResult {
  /** ok = evidence returned; empty = backend answered with nothing; unavailable = backend down/unconfigured. */
  status: Exclude<ToolStatus, 'error'>;
  /** Human-readable account of what the tool did or why it could not. */
  summary: string;
  sources: AgentSource[];
}

export interface ToolCallRecord {
  tool: string;
  args: string;
  status: ToolStatus;
  result?: string;
  error?: string;
  durationMs: number;
}

export interface AgentContext {
  personId: string;
  displayName: string;
}

export interface AgentTool {
  name: string;
  description: string;
  run(ctx: AgentContext, args: string): Promise<ToolResult>;
}

export interface AgentRunResult {
  content: string;
  agentId: AgentId;
  /** True when a language model wrote `content`; false for the evidence-only fallback. */
  generated: boolean;
  generationNote?: string;
  model?: string;
  toolCalls: ToolCallRecord[];
  sources: IndexedSource[];
  citedSourceIndexes: number[];
  invalidCitations: number[];
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

const CITATION_RULES =
  'Cite the numbered sources inline as [n] for every claim drawn from them. ' +
  'If the sources do not support an answer, say so plainly. Do not invent facts, numbers or sources.';

/**
 * Minimal agent runtime: an agent owns a system prompt and a set of tools.
 * The run loop gathers evidence by executing its tools against the user's
 * message, then the LLM composes the answer. Every tool call is reported with
 * its outcome and duration; only real records are numbered as sources.
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
    const sources: IndexedSource[] = [];

    const candidates = this.spec.toolNames
      .map((name) => this.tools.get(name))
      .filter((tool): tool is AgentTool => !!tool);

    // Execute the most relevant tools (by description overlap with the query).
    const relevant = candidates
      .map((tool) => ({ tool, score: this.descriptionOverlap(tool, lower) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const args = userMessage.slice(0, 160);
    for (const { tool } of relevant) {
      const started = Date.now();
      try {
        const result = await tool.run(ctx, userMessage);
        toolCalls.push({
          tool: tool.name,
          args,
          status: result.status,
          result: result.summary.slice(0, 400),
          durationMs: Date.now() - started,
        });
        if (result.status === 'ok') {
          for (const s of result.sources) {
            sources.push({ ...s, index: sources.length + 1 });
          }
        }
      } catch (err) {
        toolCalls.push({
          tool: tool.name,
          args,
          status: 'error',
          error: (err as Error).message,
          durationMs: Date.now() - started,
        });
      }
    }

    const evidence = sources
      .map((s) => `[${s.index}] (${s.kind}) ${s.label}: ${s.snippet.slice(0, 240)}`)
      .join('\n');
    const toolLog = toolCalls
      .map((t) => `# ${t.tool} → ${t.status}${t.error ? `: ${t.error}` : t.status !== 'ok' && t.result ? `: ${t.result}` : ''}`)
      .join('\n');

    const user = [
      `Persona: ${ctx.displayName}.`,
      `\nQuestion: ${userMessage}`,
      evidence ? `\n${fenceUntrusted(evidence)}` : '\nNo evidence was retrieved. Say that you have no data to answer from.',
      `\nTool outcomes:\n${toolLog || '(no tools ran)'}`,
    ].join('\n');

    try {
      const content = await this.llm.chat(`${this.spec.systemPrompt} ${CITATION_RULES}`, user, {
        temperature: 0.4,
        maxTokens: 700,
      });
      return {
        content,
        agentId: this.spec.id,
        generated: true,
        model: this.llm.model,
        toolCalls,
        sources,
        ...checkCitations(content, sources.length),
      };
    } catch (err) {
      const note =
        err instanceof AiUnavailableError
          ? describeAiFailure(err.kind)
          : 'The language model failed, so no answer was generated.';
      logger.warn(`LLM unavailable for agent ${this.spec.id}: ${(err as Error).message}`);
      const content = this.evidenceOnlyAnswer(evidence, toolCalls);
      return {
        content,
        agentId: this.spec.id,
        generated: false,
        generationNote: note,
        toolCalls,
        sources,
        ...checkCitations(content, sources.length),
      };
    }
  }

  /** Fallback when no model answer is available — the retrieved evidence verbatim, nothing inferred. */
  private evidenceOnlyAnswer(evidence: string, calls: ToolCallRecord[]): string {
    const unavailable = calls.filter((c) => c.status === 'unavailable' || c.status === 'error');
    const lines = [
      `${this.spec.name}: no generated answer is available, so here is the evidence I retrieved.`,
      evidence ? `\n${evidence}` : '\nI found no records relevant to this question.',
      unavailable.length > 0
        ? `\nNot consulted (unavailable): ${unavailable.map((c) => c.tool).join(', ')}.`
        : '',
    ];
    return lines.filter(Boolean).join('\n');
  }

  private descriptionOverlap(tool: AgentTool, lower: string): number {
    const words = tool.description.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    return words.reduce((n, w) => (lower.includes(w) ? n + 1 : n), 0);
  }
}
