import { chunkText } from './chunker';

describe('chunkText', () => {
  it('returns empty array for empty input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n  ')).toEqual([]);
  });

  it('returns a single chunk for short text', () => {
    const text = 'A short note about ANIMA.';
    expect(chunkText(text)).toEqual([text]);
  });

  it('splits long text into multiple chunks', () => {
    const sentence = 'The digital twin learns from every interaction, project and document. ';
    const text = sentence.repeat(60); // ~3.3k chars
    const chunks = chunkText(text, { maxChunkLength: 900 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(900);
      expect(chunk.trim().length).toBeGreaterThan(0);
    }
  });

  it('preserves overlap so context survives chunk boundaries', () => {
    const sentence = 'Each memory event carries an embedding and a human-readable summary. ';
    const text = sentence.repeat(50);
    const chunks = chunkText(text, { maxChunkLength: 500, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(1);
    // The tail of chunk n should appear at the head of chunk n+1.
    const tail = chunks[0].slice(-80).replace(/^\s+/, '');
    expect(chunks[1].includes(tail.slice(0, 40))).toBe(true);
  });

  it('respects explicit boundaries (paragraphs)', () => {
    const text = Array.from({ length: 12 }, (_, i) => `Paragraph number ${i} with some content.`)
      .join('\n');
    const chunks = chunkText(text, { maxChunkLength: 80 });
    // Paragraph bodies survive intact (only overlap tails may be carried over).
    for (const chunk of chunks) {
      expect(chunk).toMatch(/Paragraph number \d+ with some content\./);
    }
  });
});
