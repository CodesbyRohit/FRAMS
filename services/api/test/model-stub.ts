import { createServer, Server } from 'http';
import { AddressInfo } from 'net';

/**
 * Deterministic stand-in for an OpenAI-compatible provider, for integration
 * tests only. Embeddings are hashed bag-of-words vectors (so texts sharing
 * words are similar); chat returns a fixed reply. It exercises the real
 * Qdrant/Postgres/Neo4j plumbing without a model provider — it says nothing
 * about answer quality.
 */
export const STUB_DIM = 64;
export const STUB_REPLY = 'From your documents: CRDTs merge concurrent edits [1]. Unrelated claim [9].';

export function embed(text: string): number[] {
  const v = new Array<number>(STUB_DIM).fill(0);
  for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    let h = 0;
    for (const c of word) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    v[h % STUB_DIM] += 1;
  }
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

export async function startModelStub(): Promise<{ url: string; server: Server }> {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const json = body ? JSON.parse(body) : {};
      res.setHeader('content-type', 'application/json');
      if (req.url?.endsWith('/embeddings')) {
        const input: string[] = Array.isArray(json.input) ? json.input : [json.input];
        res.end(JSON.stringify({ data: input.map((t) => ({ embedding: embed(String(t)) })) }));
      } else if (req.url?.endsWith('/chat/completions')) {
        res.end(JSON.stringify({ choices: [{ message: { content: STUB_REPLY } }] }));
      } else {
        res.statusCode = 404;
        res.end('{}');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/v1`, server };
}
