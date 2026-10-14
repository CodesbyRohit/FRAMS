import { AiUnavailableError } from '../ai/ai-error';
import { LlmClient } from '../ai/llm.client';
import { Agent, AgentTool, ToolResult } from './framework';

class FailingLlm extends LlmClient {
  constructor(private readonly error: Error = new Error('no model configured')) {
    super({ get: (_key: string, fallback: unknown) => fallback } as any);
  }

  async complete(): Promise<string> {
    throw this.error;
  }
}

class FixedLlm extends LlmClient {
  constructor(private readonly reply: string) {
    super({ get: (_key: string, fallback: unknown) => fallback } as any);
  }

  async complete(): Promise<string> {
    return this.reply;
  }
}

const spec = {
  id: 'identity' as const,
  name: 'Identity Agent',
  description: 'Explains who you are from twin data.',
  keywords: ['who am i', 'strengths'],
  systemPrompt: 'You are ANIMA. Be honest.',
  toolNames: ['twin_state'],
};

function tool(name: string, run: () => Promise<ToolResult>): AgentTool {
  return { name, description: `${name} tool reads the digital twin state.`, run };
}

const twinTool = tool('twin_state', async () => ({
  status: 'ok',
  summary: 'Read the digital twin.',
  sources: [{ kind: 'twin', label: 'Digital twin', snippet: 'Skills: TypeScript, GraphQL', refId: 'twin_1' }],
}));

describe('Agent framework', () => {
  it('scores agents by keyword overlap', () => {
    const agent = new Agent(spec, new Map([['twin_state', twinTool]]), new FailingLlm());
    expect(agent.keywordScore('who am i and what are my strengths?')).toBe(2);
    expect(agent.keywordScore('unrelated question about weather')).toBe(0);
  });

  it('falls back to evidence only, labelled as not generated, when the LLM fails', async () => {
    const agent = new Agent(spec, new Map([['twin_state', twinTool]]), new FailingLlm());
    const result = await agent.run('who am I?', { personId: 'p1', displayName: 'Ada' });
    expect(result.agentId).toBe('identity');
    expect(result.generated).toBe(false);
    expect(result.generationNote).toBeTruthy();
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({ tool: 'twin_state', status: 'ok' });
    expect(result.toolCalls[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(result.sources).toEqual([
      { index: 1, kind: 'twin', label: 'Digital twin', snippet: 'Skills: TypeScript, GraphQL', refId: 'twin_1' },
    ]);
    // The fallback surfaces exactly the evidence it gathered.
    expect(result.content).toContain('Skills: TypeScript');
  });

  it('explains the model failure kind instead of always blaming configuration', async () => {
    const agent = new Agent(
      spec,
      new Map([['twin_state', twinTool]]),
      new FailingLlm(new AiUnavailableError('timeout', 'slow')),
    );
    const result = await agent.run('who am I?', { personId: 'p1', displayName: 'Ada' });
    expect(result.generationNote).toMatch(/did not respond in time/);
  });

  it('records tool errors with status=error without crashing the run', async () => {
    const broken = new Agent(
      { ...spec, toolNames: ['broken_tool'] },
      new Map([
        ['broken_tool', tool('broken_tool', async () => Promise.reject(new Error('qdrant down')))],
      ]),
      new FailingLlm(),
    );
    const result = await broken.run('remember something', { personId: 'p1', displayName: 'Ada' });
    expect(result.toolCalls[0]).toMatchObject({ status: 'error', error: 'qdrant down' });
    expect(result.sources).toEqual([]);
  });

  it('never turns empty or unavailable tool results into sources', async () => {
    const agent = new Agent(
      { ...spec, toolNames: ['empty_tool', 'down_tool'] },
      new Map([
        ['empty_tool', tool('empty_tool', async () => ({ status: 'empty', summary: 'No matching memories found.', sources: [] }))],
        [
          'down_tool',
          tool('down_tool', async () => ({
            status: 'unavailable',
            summary: 'Vector store down',
            // Even if a tool misbehaves and attaches sources, they are dropped when not ok.
            sources: [{ kind: 'memory', label: 'stale', snippet: 'stale' }],
          })),
        ],
      ]),
      new FailingLlm(),
    );
    const result = await agent.run('anything', { personId: 'p1', displayName: 'Ada' });
    expect(result.sources).toEqual([]);
    expect(result.toolCalls.map((t) => t.status).sort()).toEqual(['empty', 'unavailable']);
    expect(result.content).toContain('found no records');
  });

  it('validates the citations of a generated answer against the numbered sources', async () => {
    const agent = new Agent(
      spec,
      new Map([['twin_state', twinTool]]),
      new FixedLlm('You work in TypeScript [1]. You also founded a company [4].'),
    );
    const result = await agent.run('who am I?', { personId: 'p1', displayName: 'Ada' });
    expect(result.generated).toBe(true);
    expect(result.citedSourceIndexes).toEqual([1]);
    expect(result.invalidCitations).toEqual([4]);
  });
});
