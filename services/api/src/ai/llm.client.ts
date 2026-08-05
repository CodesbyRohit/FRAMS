import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmChatOptions {
  temperature?: number;
  /** Ask for a strict JSON object response (enforced via response_format when supported). */
  json?: boolean;
  maxTokens?: number;
}

/**
 * Minimal, dependency-free LLM client for any OpenAI-compatible endpoint
 * (OpenAI, Azure, Groq, Ollama, LM Studio, vLLM...). Keeping this thin means
 * the whole agent stack works against whatever model the operator deploys.
 */
@Injectable()
export class LlmClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(cfg: ConfigService) {
    this.baseUrl = cfg.get('ANIMA_LLM_BASE_URL', 'http://localhost:11434/v1').replace(/\/$/, '');
    this.apiKey = cfg.get('ANIMA_LLM_API_KEY', '');
    this.model = cfg.get('ANIMA_LLM_MODEL', 'gpt-4o-mini');
    this.timeoutMs = cfg.get<number>('ANIMA_LLM_TIMEOUT_MS', 30_000);
  }

  async chat(system: string, user: string, opts: LlmChatOptions = {}): Promise<string> {
    const messages: LlmMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
    return this.complete(messages, opts);
  }

  async complete(messages: LlmMessage[], opts: LlmChatOptions = {}): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: opts.temperature ?? 0.4,
          max_tokens: opts.maxTokens ?? 1200,
          ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`LLM ${res.status}: ${body.slice(0, 300)}`);
      }
      const data = (await res.json()) as {
        choices: Array<{ message: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('LLM returned an empty completion.');
      }
      return content;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Ask the model for a JSON object and return it parsed (with a safe retry). */
  async chatJson<T>(system: string, user: string, opts: LlmChatOptions = {}): Promise<T> {
    const raw = await this.chat(system, user, { ...opts, json: true });
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error('LLM did not return a JSON object.');
    }
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      throw new Error('LLM returned invalid JSON.');
    }
  }
}
