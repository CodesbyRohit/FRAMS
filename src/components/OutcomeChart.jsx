import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDay } from '../lib/format';

// Stacked daily outcomes. Status colours (validated on the dark surface) are
// always paired with a legend label and a table view, never colour alone.
const SERIES = [
  { key: 'present', label: 'Present', color: 'var(--viz-good)' },
  { key: 'pending', label: 'Pending review', color: 'var(--viz-warning)' },
  { key: 'rejected', label: 'Rejected', color: 'var(--viz-critical)' },
];

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{formatDay(label, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
      {SERIES.map((s) => {
        const v = payload.find((p) => p.dataKey === s.key)?.value ?? 0;
        return (
          <div className="chart-tooltip-row" key={s.key}>
            <span className="legend-key"><span className="legend-swatch" style={{ background: s.color }} />{s.label}</span>
            <span className="mono">{v}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function OutcomeChart({ data }) {
  const [view, setView] = useState('chart');
  const total = data.reduce((n, d) => n + d.present + d.pending + d.rejected, 0);

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row-between">
        <div className="chart-legend" aria-hidden={view === 'table'}>
          {SERIES.map((s) => <span key={s.key} className="legend-key"><span className="legend-swatch" style={{ background: s.color }} />{s.label}</span>)}
        </div>
        <div className="segmented" role="group" aria-label="Display as">
          <button type="button" aria-pressed={view === 'chart'} onClick={() => setView('chart')}>Chart</button>
          <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>Table</button>
        </div>
      </div>

      {view === 'chart' ? (
        <div style={{ height: 240 }} role="img" aria-label={`Daily attendance outcomes for the last ${data.length} days, ${total} records in total. Switch to table view for exact values.`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d) => formatDay(d, { day: 'numeric', month: 'short' })} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
              <YAxis allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              {SERIES.map((s, i) => (
                <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} stroke="var(--surface)" strokeWidth={2}
                  radius={i === SERIES.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} maxBarSize={28} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="table-wrap" style={{ maxHeight: 260 }}>
          <table className="table">
            <thead><tr><th>Date</th>{SERIES.map((s) => <th key={s.key} className="right">{s.label}</th>)}</tr></thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.date}>
                  <td>{formatDay(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                  {SERIES.map((s) => <td key={s.key} className="right mono">{d[s.key]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
