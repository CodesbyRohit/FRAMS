/** Why a model call did not produce a usable result. Surfaced to the UI verbatim. */
export type AiFailureKind =
  | 'not_configured'
  | 'timeout'
  | 'provider_error'
  | 'invalid_response';

export class AiUnavailableError extends Error {
  constructor(
    readonly kind: AiFailureKind,
    message: string,
  ) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

export function describeAiFailure(kind: AiFailureKind): string {
  switch (kind) {
    case 'not_configured':
      return 'No language model is configured (ANIMA_LLM_BASE_URL / ANIMA_LLM_API_KEY).';
    case 'timeout':
      return 'The language model did not respond in time.';
    case 'provider_error':
      return 'The language model provider returned an error.';
    case 'invalid_response':
      return 'The language model returned an unusable response.';
  }
}

const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal|ollama)$/i;

/**
 * A provider counts as configured when it has a base URL and either an API
 * key or a local host (Ollama, LM Studio...). The `.env.example` placeholder
 * key `sk-...` is treated as missing.
 */
export function providerConfigured(baseUrl: string, apiKey: string): boolean {
  if (!baseUrl) return false;
  const key = apiKey.trim();
  if (key && key !== 'sk-...') return true;
  try {
    return LOCAL_HOSTS.test(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new AiUnavailableError('timeout', `Request timed out after ${timeoutMs} ms.`);
    }
    throw new AiUnavailableError('provider_error', `Provider unreachable: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}
