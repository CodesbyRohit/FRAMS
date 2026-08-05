'use client';

import { useQuery } from '@apollo/client';
import { useState } from 'react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/glass-card';
import { PageLoader } from '@/components/ui/spinner';
import {
  GalaxyCanvas,
  type GalaxyNode,
} from '@/components/galaxy/galaxy-canvas';
import { KNOWLEDGE_GRAPH } from '@/lib/graphql';

const LEGEND = [
  { type: 'Person', color: '#a78bfa' },
  { type: 'Skill', color: '#22d3ee' },
  { type: 'Project', color: '#818cf8' },
  { type: 'Goal', color: '#34d399' },
  { type: 'Memory', color: '#94a3b8' },
  { type: 'Document', color: '#fbbf24' },
  { type: 'Idea', color: '#f472b6' },
  { type: 'Meeting', color: '#2dd4bf' },
];

export default function GalaxyPage() {
  const { data, loading } = useQuery(KNOWLEDGE_GRAPH, { variables: { limit: 140 }, ssr: false });
  const [selected, setSelected] = useState<GalaxyNode | null>(null);

  if (loading) return <PageLoader label="Materializing the galaxy…" />;

  const nodes: GalaxyNode[] = (data?.knowledgeGraph?.nodes ?? []).map((n: any) => ({
    id: n.id,
    type: n.type,
    label: n.label,
    properties: n.properties,
  }));
  const edges = data?.knowledgeGraph?.edges ?? [];
  const available = data?.knowledgeGraphAvailable ?? false;

  const selectedProps = selected?.properties ? (() => {
    try {
      return JSON.parse(selected.properties) as Record<string, unknown>;
    } catch {
      return {};
    }
  })() : {};

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-white">Knowledge Galaxy</h1>
          <p className="mt-1 text-sm text-slate-500">
            Your people, skills, projects and ideas — one explorable constellation.
          </p>
        </div>
        <Badge tone={available ? 'emerald' : 'amber'}>
          {available ? 'Neo4j connected' : 'Graph backend offline'}
        </Badge>
      </div>

      {nodes.length === 0 ? (
        <GlassCard className="flex flex-col items-center gap-4 p-14 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-aurora-violet/10 text-3xl">
            ✧
          </div>
          <div>
            <h2 className="font-semibold text-white">The galaxy is waiting for its first star</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
              Every memory event, skill, project and goal you record becomes a node here.
              {!available && ' Neo4j is not reachable — start it with `npm run infra:up`.'}
            </p>
          </div>
          <Link href="/app" className="btn-primary">
            Feed your twin
          </Link>
        </GlassCard>
      ) : (
        <div className="grid gap-6 lg:grid-cols-4">
          <GlassCard className="relative h-[560px] overflow-hidden lg:col-span-3">
            <GalaxyCanvas nodes={nodes} edges={edges} onSelect={setSelected} />
            <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-[11px] text-slate-600">
              Drag to orbit · scroll to zoom · hover a node to inspect
            </p>
          </GlassCard>

          <div className="space-y-4">
            <GlassCard className="p-5">
              <h3 className="text-sm font-semibold text-white">Legend</h3>
              <div className="mt-3 space-y-2">
                {LEGEND.filter((l) => nodes.some((n) => n.type === l.type)).map((l) => (
                  <div key={l.type} className="flex items-center gap-2.5 text-sm text-slate-400">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
                    {l.type}
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[11px] text-slate-600">
                {nodes.length} nodes · {edges.length} connections
              </p>
            </GlassCard>

            <GlassCard className="min-h-[140px] p-5">
              {selected ? (
                <>
                  <h3 className="text-sm font-semibold text-white">{selected.label}</h3>
                  <Badge tone="violet" className="mt-2">
                    {selected.type}
                  </Badge>
                  {Object.keys(selectedProps).length > 0 && (
                    <pre className="mt-3 max-h-40 overflow-auto text-[11px] text-slate-500">
                      {JSON.stringify(selectedProps, null, 2)}
                    </pre>
                  )}
                </>
              ) : (
                <p className="text-xs text-slate-600">
                  Hover a node to see what it is and what it knows.
                </p>
              )}
            </GlassCard>
          </div>
        </div>
      )}
    </div>
  );
}
