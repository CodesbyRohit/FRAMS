'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/glass-card';

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const },
};

const twinDimensions = [
  { icon: '◈', title: 'AI Identity', body: 'Who you are — verified through passkeys and a face-only trust gateway, never surveillance.' },
  { icon: '❖', title: 'AI Memory', body: 'Every interaction becomes structured, searchable knowledge. Nothing is forgotten, everything is explainable.' },
  { icon: '◉', title: 'AI Trust Score', body: 'An explainable identity confidence — face, device and behavior fused into one honest number.' },
  { icon: '⌁', title: 'AI Timeline', body: 'Your life in the platform, as an event-sourced stream you can rewind and interrogate.' },
  { icon: '◇', title: 'AI Context', body: 'Goals, skills and interests, kept current by agents that watch your work, not your screens.' },
  { icon: '✧', title: 'AI Knowledge Graph', body: 'People, projects and ideas — a galaxy of connections you can literally walk through in 3D.' },
];

const agents = [
  { id: 'identity', name: 'Identity Agent', desc: 'Explains who you are becoming.' },
  { id: 'memory', name: 'Memory Agent', desc: 'Recalls everything you worked on.' },
  { id: 'research', name: 'Research Agent', desc: 'Answers from your documents, with citations.' },
  { id: 'learning', name: 'Learning Agent', desc: 'Tracks learning speed and gaps.' },
  { id: 'productivity', name: 'Productivity Agent', desc: 'Surfaces momentum and focus.' },
  { id: 'creativity', name: 'Creativity Agent', desc: 'Connects ideas into new ones.' },
  { id: 'networking', name: 'Networking Agent', desc: 'Finds your best collaborators.' },
  { id: 'knowledge', name: 'Knowledge Agent', desc: 'Answers anything about your world.' },
  { id: 'planner', name: 'Planner Agent', desc: 'Recommends your next project.' },
  { id: 'security', name: 'Security Agent', desc: 'Watches your trust posture.' },
];

export default function LandingPage() {
  const years = useMemo(() => 2026 - 2023, []);

  return (
    <main className="aurora-bg relative min-h-screen">
      {/* ── Navigation ─────────────────────────────────────────────────── */}
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-ink-950/60 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-aurora-violet to-aurora-cyan text-sm font-bold text-white shadow-glow">
              A
            </span>
            <span className="font-display text-lg font-semibold tracking-tight text-white">
              ANIMA
            </span>
          </Link>
          <div className="hidden items-center gap-8 text-sm text-slate-400 md:flex">
            <a href="#twin" className="transition-colors hover:text-white">The Twin</a>
            <a href="#agents" className="transition-colors hover:text-white">Agents</a>
            <a href="#trust" className="transition-colors hover:text-white">Trust</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="btn-ghost !py-2 text-sm">
              Sign in
            </Link>
            <Link href="/register" className="btn-primary !py-2 text-sm">
              Create identity
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-6 pb-24 pt-40">
        <div className="grid-overlay absolute inset-0" />
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="relative mx-auto max-w-4xl text-center"
        >
          <Badge tone="violet" className="mb-8">
            <span className="live-dot mr-1.5" /> A new category of software
          </Badge>
          <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight text-white sm:text-7xl">
            The intelligence of
            <br />
            <span className="text-gradient">who you are.</span>
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-slate-400">
            ANIMA gives every person an evolving AI digital twin — memory,
            skills, relationships, growth — learned from the work you already
            do. Face recognition is just the gateway. This is the rest of the story.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link href="/register" className="btn-primary !px-8 !py-3.5 text-base">
              Start your twin
            </Link>
            <Link href="/login" className="btn-ghost !px-8 !py-3.5 text-base">
              Sign in with face or passkey
            </Link>
          </div>
        </motion.div>

        {/* Floating twin preview */}
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="relative mx-auto mt-20 max-w-3xl"
        >
          <div className="glass animate-float p-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-slate-500">Digital Twin · v12</p>
                <p className="mt-1 font-display text-2xl font-semibold text-white">Aurora Chen</p>
              </div>
              <div className="flex gap-2">
                <Badge tone="violet">TypeScript 86%</Badge>
                <Badge tone="cyan">GraphQL 74%</Badge>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-4">
              {[
                { k: 'Memories', v: '148' },
                { k: 'Projects', v: '12' },
                { k: 'Interactions', v: '3,204' },
              ].map((s) => (
                <div key={s.k} className="rounded-xl border border-white/5 bg-white/[0.03] p-4 text-center">
                  <p className="text-2xl font-semibold text-white">{s.v}</p>
                  <p className="mt-1 text-xs text-slate-500">{s.k}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-aurora-violet/20 bg-aurora-violet/5 p-4 text-sm text-slate-300">
              <span className="text-gradient font-semibold">Narrative:</span>{' '}
              &ldquo;A product engineer who turns ambiguity into shipped systems —
              currently compounding systems design, powered by 12 consecutive
              weeks of documented practice.&rdquo;
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── The Twin ──────────────────────────────────────────────────── */}
      <section id="twin" className="mx-auto max-w-6xl px-6 py-24">
        <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-4xl font-bold tracking-tight text-white">
            One twin. <span className="text-gradient">Six intelligences.</span>
          </h2>
          <p className="mt-4 text-slate-400">
            ANIMA continuously understands who you are, how you interact, what
            you know, what you build, how you grow — and it shows its work.
          </p>
        </motion.div>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {twinDimensions.map((d, i) => (
            <GlassCard key={d.title} hover delay={i * 0.06} className="p-6">
              <span className="text-2xl text-aurora-violet">{d.icon}</span>
              <h3 className="mt-4 font-semibold text-white">{d.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{d.body}</p>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* ── Agents ────────────────────────────────────────────────────── */}
      <section id="agents" className="mx-auto max-w-6xl px-6 py-24">
        <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-4xl font-bold tracking-tight text-white">
            Ten agents. <span className="text-gradient">One conversation.</span>
          </h2>
          <p className="mt-4 text-slate-400">
            No dashboards to learn. Ask anything — &ldquo;what have I learned this
            year?&rdquo;, &ldquo;who should I collaborate with?&rdquo;, &ldquo;what should I build next?&rdquo; — and
            the right agent answers, citing its sources.
          </p>
        </motion.div>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {agents.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, scale: 0.94 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: i * 0.04 }}
              className="glass glass-hover p-5"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-aurora-violet/30 to-aurora-cyan/20 text-xs font-bold uppercase text-violet-200">
                {a.id.slice(0, 2)}
              </div>
              <h3 className="mt-3 text-sm font-semibold text-white">{a.name}</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{a.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Trust ─────────────────────────────────────────────────────── */}
      <section id="trust" className="mx-auto max-w-6xl px-6 py-24">
        <GlassCard className="overflow-hidden">
          <div className="grid gap-10 p-10 md:grid-cols-2 md:p-14">
            <motion.div {...fadeUp}>
              <Badge tone="cyan">The trust layer</Badge>
              <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-white">
                Your face opens the door.
                <br />
                It never watches you.
              </h2>
              <p className="mt-4 leading-relaxed text-slate-400">
                ANIMA repurposes face recognition into an independent Trust
                Service: onboarding, passwordless login, liveness and
                anti-spoofing, and a continuous identity confidence score. There
                is no attendance, no time-tracking, no surveillance — by design.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-slate-300">
                {[
                  'Passkeys (WebAuthn) as the primary factor',
                  'Blink-challenge liveness — photos and replays fail',
                  'Every score is explainable, every session revocable',
                  'Privacy-first: on-device capture, scoped storage',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span className="mt-0.5 text-emerald-400">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
            <motion.div {...fadeUp} className="flex items-center justify-center">
              <div className="relative">
                <div className="absolute -inset-8 rounded-full bg-aurora-violet/20 blur-3xl" />
                <div className="glass relative flex h-64 w-64 flex-col items-center justify-center gap-3">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border border-aurora-cyan/40 bg-gradient-to-br from-aurora-violet/30 to-aurora-cyan/20 text-3xl">
                    ◎
                  </div>
                  <p className="text-sm font-medium text-white">Identity confidence</p>
                  <p className="font-display text-4xl font-bold text-gradient">92.4%</p>
                  <p className="text-xs text-slate-500">face · liveness · device · behavior</p>
                </div>
              </div>
            </motion.div>
          </div>
        </GlassCard>
      </section>

      {/* ── CTA + Footer ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 pb-24 pt-8 text-center">
        <motion.div {...fadeUp}>
          <h2 className="font-display text-4xl font-bold tracking-tight text-white">
            Your intelligence deserves a home.
          </h2>
          <p className="mt-4 text-slate-400">
            Join ANIMA and meet the twin that never forgets who you&apos;re becoming.
          </p>
          <Link href="/register" className="btn-primary mt-8 !px-8 !py-3.5 text-base">
            Create your identity — it takes 30 seconds
          </Link>
        </motion.div>
      </section>

      <footer className="border-t border-white/5 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-xs text-slate-600 sm:flex-row">
          <p>© {years + 2023} ANIMA — The Intelligence of Who You Are.</p>
          <p>Face recognition is a trust layer. Not a tracking system.</p>
        </div>
      </footer>
    </main>
  );
}
