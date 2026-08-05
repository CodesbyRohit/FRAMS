'use client';

import { useQuery } from '@apollo/client';
import { motion } from 'framer-motion';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import { PageLoader } from '@/components/ui/spinner';
import { useTwinActions } from '@/lib/twin-actions';
import { ME, MY_INSIGHTS, MY_MEMORIES } from '@/lib/graphql';

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
};

export default function TwinPage() {
  const { data, loading } = useQuery(ME, { ssr: false });
  const { data: insightsData } = useQuery(MY_INSIGHTS, { ssr: false });
  const { data: memoryData } = useQuery(MY_MEMORIES, { ssr: false });
  const twin = data?.me?.twin;

  const { markSkill, setGoal, ingest } = useTwinActions();
  const [skillName, setSkillName] = useState('');
  const [goalTitle, setGoalTitle] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading || !twin) return <PageLoader label="Waking your twin…" />;

  const stats = [
    { label: 'Memories', value: twin.stats.memories },
    { label: 'Documents', value: twin.stats.documents },
    { label: 'Projects', value: twin.stats.projects },
    { label: 'Interactions', value: twin.stats.interactions },
  ];
  const topSkills = [...twin.skills].sort((a, b) => b.level - a.level).slice(0, 8);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-500">
            Digital Twin · v{twin.version}
          </p>
          <h1 className="mt-1 font-display text-4xl font-bold text-white">
            {data.me.displayName}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">{twin.narrative}</p>
        </div>
        <Badge tone="emerald">
          <span className="live-dot mr-1.5" /> twin is learning
        </Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s, i) => (
          <GlassCard key={s.label} delay={i * 0.05} className="p-5">
            <p className="font-display text-3xl font-bold text-white">{s.value}</p>
            <p className="mt-1 text-xs text-slate-500">{s.label}</p>
          </GlassCard>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Skills + goals */}
        <div className="space-y-6 lg:col-span-3">
          <GlassCard className="p-6">
            <h2 className="font-semibold text-white">Observed skills</h2>
            <p className="mt-1 text-xs text-slate-500">
              Derived from evidence — not self-reported.
            </p>
            <div className="mt-5 space-y-4">
              {topSkills.map((skill, i) => (
                <motion.div key={skill.name} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.05 }}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="text-slate-200">{skill.name}</span>
                    <span className="text-xs text-slate-500">
                      {Math.round(skill.level * 100)}% · {skill.evidenceCount} evidence
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/5">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: `${Math.max(6, skill.level * 100)}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.9, ease: 'easeOut' }}
                      className="h-full rounded-full bg-gradient-to-r from-aurora-violet to-aurora-cyan"
                    />
                  </div>
                </motion.div>
              ))}
              {topSkills.length === 0 && (
                <p className="text-sm text-slate-500">
                  No skills observed yet. Record your first one below.
                </p>
              )}
            </div>

            {/* Quick actions */}
            <div className="mt-6 space-y-3 border-t border-white/5 pt-5">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (skillName.trim()) run(() => markSkill(skillName.trim()));
                  setSkillName('');
                }}
              >
                <input
                  className="input-dark flex-1"
                  placeholder="Skill you practiced (e.g. GraphQL)"
                  value={skillName}
                  onChange={(e) => setSkillName(e.target.value)}
                />
                <Button type="submit" loading={busy} variant="ghost">
                  Record
                </Button>
              </form>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (goalTitle.trim()) run(() => setGoal(goalTitle.trim()));
                  setGoalTitle('');
                }}
              >
                <input
                  className="input-dark flex-1"
                  placeholder="New goal (e.g. Ship the recommender)"
                  value={goalTitle}
                  onChange={(e) => setGoalTitle(e.target.value)}
                />
                <Button type="submit" loading={busy} variant="ghost">
                  Declare
                </Button>
              </form>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (note.trim()) run(() => ingest('NOTE_CREATED', note.trim()));
                  setNote('');
                }}
              >
                <input
                  className="input-dark flex-1"
                  placeholder="Anything worth remembering…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <Button type="submit" loading={busy} variant="ghost">
                  Remember
                </Button>
              </form>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="font-semibold text-white">Goals</h2>
            <div className="mt-4 space-y-3">
              {twin.goals.length === 0 && (
                <p className="text-sm text-slate-500">Declare a goal and the planner agent will track it.</p>
              )}
              {twin.goals.map((g: any) => (
                <div key={g.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-white">{g.title}</p>
                    <p className="mt-0.5 text-xs capitalize text-slate-500">{g.status}</p>
                  </div>
                  <Badge tone={g.status === 'achieved' ? 'emerald' : 'violet'}>
                    {Math.round(g.progress * 100)}%
                  </Badge>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>

        {/* Insights + timeline */}
        <div className="space-y-6 lg:col-span-2">
          <GlassCard className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">Insights</h2>
              <Badge tone="cyan">explainable AI</Badge>
            </div>
            <div className="mt-4 space-y-4">
              {insightsData?.myInsights?.map((insight: any) => (
                <div key={insight.id} className="rounded-xl border border-aurora-violet/15 bg-aurora-violet/5 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-violet-200">{insight.title}</p>
                    <span className="text-xs text-slate-500">{Math.round(insight.confidence * 100)}%</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">{insight.body}</p>
                  {insight.evidence.length > 0 && (
                    <p className="mt-3 text-[11px] text-slate-500">
                      Evidence: {insight.evidence.map((e: any) => e.label).join(' · ')}
                    </p>
                  )}
                </div>
              ))}
              {!insightsData?.myInsights?.length && (
                <p className="text-sm text-slate-500">Insights appear once your twin has evidence to reason over.</p>
              )}
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="font-semibold text-white">Recent timeline</h2>
            <div className="mt-4 space-y-3">
              {memoryData?.myMemoryEvents?.slice(0, 6).map((e: any) => (
                <div key={e.id} className="flex items-start gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-aurora-cyan/70" />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-300">{e.summary}</p>
                    <p className="text-[11px] text-slate-600">
                      {new Date(e.occurredAt).toLocaleDateString()} · {e.type}
                    </p>
                  </div>
                </div>
              ))}
              {!memoryData?.myMemoryEvents?.length && (
                <p className="text-sm text-slate-500">Your timeline is empty — it starts with your first action.</p>
              )}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
