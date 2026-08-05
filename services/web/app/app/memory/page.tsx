'use client';

import { useQuery } from '@apollo/client';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import { PageLoader } from '@/components/ui/spinner';
import { getToken } from '@/lib/auth';
import { apolloClient } from '@/lib/apollo';
import { useTwinActions } from '@/lib/twin-actions';
import { MY_DOCUMENTS, MY_MEMORIES, SEARCH_MEMORIES } from '@/lib/graphql';

export default function MemoryPage() {
  const { data, loading, refetch } = useQuery(MY_MEMORIES, { ssr: false });
  const { data: docsData, refetch: refetchDocs } = useQuery(MY_DOCUMENTS, { ssr: false });
  const { ingest } = useTwinActions();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      const { data: res } = await apolloClient.query({
        query: SEARCH_MEMORIES,
        variables: { query: query.trim(), limit: 10 },
      });
      setResults(res.searchMemories);
    } finally {
      setSearching(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/rag/upload`,
        { method: 'POST', headers: { authorization: `Bearer ${getToken()}` }, body: form },
      );
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || 'Upload failed');
      }
      setUploadMsg(`"${file.name}" indexed into your corpus.`);
      refetch();
      refetchDocs();
    } catch (err) {
      setUploadMsg(`Upload failed: ${(err as Error).message}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  if (loading) return <PageLoader label="Opening the memory vault…" />;

  const memories = results ?? data?.myMemories ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-white">Memory</h1>
        <p className="mt-1 text-sm text-slate-500">
          Everything you feed ANIMA becomes structured, searchable knowledge — recall by meaning, not keyword.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: search + ingest + upload */}
        <div className="space-y-5">
          <GlassCard className="p-5">
            <h2 className="text-sm font-semibold text-white">Semantic recall</h2>
            <form onSubmit={runSearch} className="mt-3 flex gap-2">
              <input
                className="input-dark flex-1"
                placeholder="e.g. 'the project I shipped in March'"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <Button type="submit" loading={searching} variant="ghost">
                Find
              </Button>
            </form>
            {results && (
              <button
                className="mt-2 text-xs text-slate-500 hover:text-slate-300"
                onClick={() => {
                  setResults(null);
                  setQuery('');
                }}
              >
                Clear search
              </button>
            )}
          </GlassCard>

          <GlassCard className="p-5">
            <h2 className="text-sm font-semibold text-white">Remember something</h2>
            <form
              className="mt-3 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (note.trim()) {
                  ingest('NOTE_CREATED', note.trim()).then(() => refetch());
                  setNote('');
                }
              }}
            >
              <input
                className="input-dark"
                placeholder="A note, a win, a lesson…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <Button type="submit" className="w-full" variant="ghost">
                Feed the twin
              </Button>
            </form>
          </GlassCard>

          <GlassCard className="p-5">
            <h2 className="text-sm font-semibold text-white">Add to your corpus</h2>
            <p className="mt-1 text-xs text-slate-600">
              Text, markdown, code, JSON — or images/PDFs when ANIMA_VISION_MODEL is configured.
            </p>
            <label className="mt-3 block cursor-pointer">
              <span className="btn-ghost w-full">
                {uploading ? 'Indexing…' : 'Upload a document'}
              </span>
              <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
            {uploadMsg && <p className="mt-2 text-xs text-slate-400">{uploadMsg}</p>}
            <div className="mt-4 space-y-2">
              {docsData?.myDocuments?.slice(0, 4).map((d: any) => (
                <div key={d.id} className="flex items-center justify-between text-xs">
                  <span className="truncate text-slate-300">{d.title}</span>
                  <Badge tone={d.status === 'indexed' ? 'emerald' : 'amber'}>{d.chunkCount} chunks</Badge>
                </div>
              ))}
              {!docsData?.myDocuments?.length && (
                <p className="text-xs text-slate-600">No documents yet.</p>
              )}
            </div>
          </GlassCard>
        </div>

        {/* Right: memory stream */}
        <div className="lg:col-span-2">
          <GlassCard className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">
                {results ? 'Search results' : 'Memory stream'}
              </h2>
              <Badge tone="cyan">vector-indexed</Badge>
            </div>
            <div className="mt-5 space-y-3">
              {memories.length === 0 && (
                <p className="text-sm text-slate-500">
                  No memories yet. Record a skill, declare a goal, or drop a note on the left.
                </p>
              )}
              {memories.map((m: any) => (
                <div key={m.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:border-aurora-violet/25">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white">{m.title}</p>
                    <Badge tone="violet">{m.kind}</Badge>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{m.content}</p>
                  <p className="mt-2 text-[11px] text-slate-600">
                    {new Date(m.createdAt).toLocaleDateString()} · importance {Math.round(m.importance * 100)}%
                  </p>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
