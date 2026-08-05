/**
 * Deterministic, dependency-free text chunker for the RAG pipeline.
 * Splits on paragraph/sentence boundaries with configurable overlap so
 * semantic context is preserved across chunk edges.
 */

export interface ChunkerOptions {
  maxChunkLength?: number;
  overlap?: number;
}

const DEFAULT_MAX = 900;
const DEFAULT_OVERLAP = 120;

export function chunkText(text: string, opts: ChunkerOptions = {}): string[] {
  const maxLen = opts.maxChunkLength ?? DEFAULT_MAX;
  const overlap = Math.min(opts.overlap ?? DEFAULT_OVERLAP, maxLen / 2);

  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return [];
  }
  if (normalized.length <= maxLen) {
    return [normalized];
  }

  const chunks: string[] = [];
  const sentences = normalized
    // Keep the delimiter attached to its sentence for clean boundaries.
    .split(/(?<=[.!?。！？\n])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  let current = '';
  for (const sentence of sentences) {
    if (current && current.length + sentence.length + 1 > maxLen) {
      chunks.push(current);
      current = current.slice(-overlap) + sentence;
    } else if (current) {
      current += ' ' + sentence;
    } else {
      current = sentence;
    }
    // Very long single sentences get hard-split.
    while (current.length > maxLen) {
      chunks.push(current.slice(0, maxLen));
      current = current.slice(maxLen - overlap);
    }
  }
  if (current.trim()) {
    chunks.push(current);
  }
  return chunks.filter((c) => c.trim().length > 0);
}
