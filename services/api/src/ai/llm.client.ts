import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AiUnavailableError, fetchWithTimeout, providerConfigured } from './ai-error';

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

const MAX_COMPLETION_CHARS = 12_000;

/**
 * Minimal, dependency-free LLM client for any OpenAI-compatible endpoint
 * (OpenAI, Azure, Groq, Ollama, LM Studio, vLLM...). Every failure is raised
 * as an `AiUnavailableError` with a kind the UI can explain.
 */
@Injectable()
export class LlmClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  readonly model: string;
  private readonly timeoutMs: number;

  constructor(cfg: ConfigService) {
    this.baseUrl = String(cfg.get('ANIMA_LLM_BASE_URL', 'http://localhost:11434/v1')).replace(/\/$/, '');
    this.apiKey = String(cfg.get('ANIMA_LLM_API_KEY', '') ?? '');
    this.model = cfg.get('ANIMA_LLM_MODEL', 'gpt-4o-mini');
    this.timeoutMs = Number(cfg.get('ANIMA_LLM_TIMEOUT_MS', 30_000));
  }

  isConfigured(): boolean {
    return providerConfigured(this.baseUrl, this.apiKey);
  }

  async chat(system: string, user: string, opts: LlmChatOptions = {}): Promise<string> {
    return this.complete(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      opts,
    );
  }

  async complete(messages: LlmMessage[], opts: LlmChatOptions = {}): Promise<string> {
    if (!this.isConfigured()) {
      throw new AiUnavailableError('not_configured', 'No language model is configured.');
    }
    const res = await fetchWithTimeout(
      `${this.baseUrl}/chat/completions`,
      {
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
      },
      this.timeoutMs,
    );

    if (!res.ok) {
      throw new AiUnavailableError('provider_error', `LLM provider responded ${res.status}.`);
    }
    let data: { choices?: Array<{ message?: { content?: unknown } }> };
    try {
      data = (await res.json()) as typeof data;
    } catch {
      throw new AiUnavailableError('invalid_response', 'LLM response was not JSON.');
    }
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new AiUnavailableError('invalid_response', 'LLM returned an empty completion.');
    }
    return content.trim().slice(0, MAX_COMPLETION_CHARS);
  }
}
