'use client';

import { useQuery } from '@apollo/client';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { PageLoader } from '@/components/ui/spinner';
import { apolloClient } from '@/lib/apollo';
import { AGENT_CATALOG, ASK_COPILOT, ASK_KNOWLEDGE } from '@/lib/graphql';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  agentId?: string;
  toolCalls?: Array<{ tool: string; result?: string; error?: string }>;
  sources?: Array<{ label: string; snippet: string }>;
}

const SUGGESTIONS = [
  'What have I worked on recently?',
  'Summarize my growth this year.',
  'Who should I collaborate with?',
  'What should I build next?',
  'What are my knowledge gaps?',
  'How is my trust posture?',
];

export default function CopilotPage() {
  const { data: catalogData, loading } = useQuery(AGENT_CATALOG, { ssr: false });
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'copilot' | 'knowledge'>('copilot');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: question };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setBusy(true);

    try {
      if (mode === 'knowledge') {
        const { data } = await apolloClient.query({
          query: ASK_KNOWLEDGE,
          variables: { query: question },
        });
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: data.askYourKnowledge.answer,
            sources: data.askYourKnowledge.sources,
          },
        ]);
      } else {
        const { data } = await apolloClient.query({
          query: ASK_COPILOT,
          variables: { message: question },
        });
        const reply = data.askCopilot;
        setMessages((prev) => [
          ...prev,
          {
            id: reply.id,
            role: 'assistant',
            content: reply.content,
            agentId: reply.agentId,
            toolCalls: reply.toolCalls,
            sources: reply.sources,
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `I hit a snag: ${(err as Error).message}. Check that the API is running.`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <PageLoader label="Warming up the agents…" />;

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-white">Copilot</h1>
          <p className="mt-1 text-sm text-slate-500">
            {messages.length === 0
              ? 'Ask anything about your work, growth and next steps.'
              : `Last answered by ${messages[messages.length - 1]?.agentId ?? 'ANIMA'} agent.`}
          </p>
        </div>
        <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-1">
          {(['copilot', 'knowledge'] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setMessages([]);
              }}
              className={`rounded-lg px-4 py-1.5 text-xs font-medium capitalize transition-all ${
                mode === m ? 'bg-aurora-violet/20 text-white' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {m === 'copilot' ? 'Agents' : 'Your knowledge'}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-aurora-violet/30 to-aurora-cyan/20 text-2xl shadow-glow">
              ⌘
            </div>
            <div className="grid max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="glass glass-hover px-4 py-3 text-left text-xs text-slate-300"
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {catalogData?.agentCatalog?.map((a: any) => (
                <Badge key={a.id} tone="violet">
                  {a.name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-gradient-to-br from-aurora-violet to-aurora-indigo text-white'
                    : 'glass text-slate-200'
                }`}
              >
                {m.role === 'assistant' && m.agentId && (
                  <p className="mb-1.5 text-[10px] uppercase tracking-widest text-aurora-violet">
                    {m.agentId} agent
                  </p>
                )}
                <p className="whitespace-pre-wrap">{m.content}</p>

                {m.toolCalls && m.toolCalls.length > 0 && (
                  <div className="mt-3 space-y-1 border-t border-white/10 pt-2.5">
                    {m.toolCalls.map((t, i) => (
                      <p key={i} className="text-[11px] text-slate-500">
                        <span className="text-cyan-300">⟡ {t.tool}</span>
                        {t.error ? ` — failed: ${t.error}` : ' — consulted your data'}
                      </p>
                    ))}
                  </div>
                )}

                {m.sources && m.sources.length > 0 && (
                  <div className="mt-3 space-y-1.5 border-t border-white/10 pt-2.5">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500">Sources</p>
                    {m.sources.map((s, i) => (
                      <p key={i} className="text-[11px] text-slate-400">
                        <span className="font-medium text-slate-300">{s.label}</span> — {s.snippet.slice(0, 90)}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {busy && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/15 border-t-aurora-violet" />
            {mode === 'copilot' ? 'Agent is thinking…' : 'Searching your corpus…'}
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
        className="glass flex items-center gap-2 p-2"
      >
        <input
          className="flex-1 bg-transparent px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none"
          placeholder={
            mode === 'copilot'
              ? 'Ask your agents anything…'
              : 'Ask about your documents (citations included)…'
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" disabled={busy || !input.trim()} className="btn-primary !px-4 !py-2.5">
          Send
        </button>
      </form>
    </div>
  );
}
