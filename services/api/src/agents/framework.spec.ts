import { LlmClient } from '../ai/llm.client';
import { Agent } from './framework';

class FailingLlm extends LlmClient {
  constructor() {
    super({ get: (_key: string, fallback: unknown) => fallback } as any);
  }

  async complete(): Promise<string> {
    throw new Error('no model configured');
  }
}

describe('Agent framework', () => {
  const tool = {
    name: 'twin_state',
    description: 'Read the digital twin state: skills, goals, narrative.',
    async run() {
      return {
        summary: 'Skills: TypeScript, GraphQL. Goals: build ANIMA.',
        sources: [{ label: 'digital twin', snippet: 'Skills: TypeScript' }],
      };
    },
  };

  const agent = new Agent(
    {
      id: 'identity',
      name: 'Identity Agent',
      description: 'Explains who you are from twin data.',
      keywords: ['who am i', 'strengths'],
      systemPrompt: 'You are ANIMA. Be honest.',
      toolNames: ['twin_state'],
    },
    new Map([['twin_state', tool]]),
    new FailingLlm(),
  );

  it('scores agents by keyword overlap', () => {
    expect(agent.keywordScore('who am i and what are my strengths?')).toBe(2);
    expect(agent.keywordScore('unrelated question about weather')).toBe(0);
  });

  it('executes tools and falls back to a grounded answer when the LLM is unavailable', async () => {
    const result = await agent.run('who am I?', { personId: 'p1', displayName: 'Ada' });
    expect(result.agentId).toBe('identity');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].tool).toBe('twin_state');
    expect(result.sources[0].label).toBe('digital twin');
    // The deterministic fallback must surface the evidence it actually gathered.
    expect(result.content).toContain('Skills: TypeScript');
  });

  it('records tool errors without crashing the run', async () => {
    const broken = new Agent(
      {
        id: 'memory',
        name: 'Memory Agent',
        description: 'Recall.',
        keywords: ['remember'],
        systemPrompt: 'x',
        toolNames: ['broken_tool'],
      },
      new Map([
        [
          'broken_tool',
          {
            name: 'broken_tool',
            description: 'This tool always fails.',
            async run() {
              throw new Error('qdrant down');
            },
          },
        ],
      ]),
      new FailingLlm(),
    );
    const result = await broken.run('remember something', { personId: 'p1', displayName: 'Ada' });
    expect(result.toolCalls[0].error).toContain('qdrant down');
  });
});
