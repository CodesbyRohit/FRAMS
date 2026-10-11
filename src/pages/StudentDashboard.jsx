import { Link } from 'react-router-dom';
import { CalendarCheck, Clock, MessageSquareWarning, ShieldQuestion } from 'lucide-react';
import api from '../services/api';
import useResource from '../lib/useResource';
import { useAuth } from '../context/auth';
import { daysBack, errorMessage, formatDay, isoDate, METHOD } from '../lib/format';
import { Card, EmptyState, ErrorState, Loading, Notice, PageHeader, Stat, StatusPill } from '../ui';

const STRIP_DAYS = 35;

const load = async () => {
  const [att, corr] = await Promise.all([api.get('/attendance/me'), api.get('/corrections')]);
  return { attendance: att.data, corrections: corr.data };
};

export default function MyAttendance() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useResource(load);

  const header = (
    <PageHeader eyebrow="My attendance" title={`Hello, ${user.name?.split(' ')[0] ?? ''}`}
      description="Days FRAMS has recorded for you, and anything still waiting on a decision."
      actions={<Link className="btn" to="/corrections"><MessageSquareWarning size={16} aria-hidden="true" /> Request a correction</Link>} />
  );

  if (loading && !data) return <>{header}<Loading /></>;
  if (error && !data) return <>{header}<div className="card"><ErrorState message={errorMessage(error)} onRetry={reload} /></div></>;

  const { attendance, corrections } = data;
  const byDate = new Map(attendance.map((a) => [a.date, a]));
  const days = daysBack(STRIP_DAYS);
  const recentPresent = days.filter((d) => byDate.get(d)?.status === 'present').length;
  const pending = attendance.filter((a) => a.status === 'pending_review').length;
  const openCorrections = corrections.filter((c) => c.status === 'pending').length;
  const last = attendance.find((a) => a.status === 'present');
  const today = isoDate();

  return (
    <>
      {header}
      <div className="stack-lg">
        <div className="grid-stats">
          <Stat label={`Days present · last ${STRIP_DAYS} days`} icon={CalendarCheck} value={recentPresent} />
          <Stat label="Last recorded" icon={Clock} value={<span style={{ fontSize: 'var(--text-xl)' }}>{last ? formatDay(last.date, { day: 'numeric', month: 'short' }) : '—'}</span>} foot={last ? `at ${last.time}` : 'No records yet'} />
          <Stat label="Waiting for review" icon={ShieldQuestion} value={pending} foot={pending ? 'A faculty member will decide' : 'Nothing pending'} />
          <Stat label="Open correction requests" icon={MessageSquareWarning} value={openCorrections} foot={<Link to="/corrections">View requests</Link>} />
        </div>

        <Notice tone="info">FRAMS doesn’t know your class timetable, so it can’t show an attendance percentage — only the days it has recorded.</Notice>

        <Card title="Last 35 days" sub="Each square is a day">
          <div className="card-body stack">
            <div className="daystrip" role="list">
              {days.map((d) => {
                const rec = byDate.get(d);
                const state = rec ? (rec.status === 'present' ? 'present' : rec.status === 'pending_review' ? 'pending' : rec.status === 'rejected' ? 'rejected' : undefined) : undefined;
                const label = `${formatDay(d, { weekday: 'long', day: 'numeric', month: 'long' })}: ${rec ? rec.status.replace('_', ' ') : 'no record'}`;
                return <div key={d} className="day" role="listitem" data-state={state} data-today={d === today} title={label} aria-label={label} />;
              })}
            </div>
            <div className="chart-legend">
              <span className="legend-key"><span className="legend-swatch" style={{ background: 'rgba(95,211,148,0.5)' }} />Present</span>
              <span className="legend-key"><span className="legend-swatch" style={{ background: 'repeating-linear-gradient(135deg, rgba(242,189,75,.6) 0 2px, rgba(242,189,75,.2) 2px 4px)' }} />Pending review</span>
              <span className="legend-key"><span className="legend-swatch" style={{ background: 'rgba(242,122,122,0.4)' }} />Rejected</span>
              <span className="legend-key"><span className="legend-swatch" style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border)' }} />No record</span>
            </div>
          </div>
        </Card>

        <Card title="History">
          {attendance.length === 0 ? (
            <EmptyState icon={CalendarCheck} title="No attendance recorded yet" description="When you’re verified at a kiosk or marked by faculty, the day will appear here."
              action={<Link className="btn btn-sm" to="/corrections">Something missing? Request a correction</Link>} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Day</th><th>Time</th><th>Status</th><th>How</th><th>What this means</th></tr></thead>
                <tbody>
                  {attendance.map((a) => (
                    <tr key={a._id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDay(a.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td className="mono">{a.time}</td>
                      <td><StatusPill value={a.status} /></td>
                      <td className="secondary">{METHOD[a.method || 'face']}</td>
                      <td className="cell-sub" style={{ maxWidth: 340 }}>
                        {a.status === 'pending_review' && 'The scan wasn’t conclusive. A faculty member will confirm it — you don’t need to do anything.'}
                        {a.status === 'rejected' && <>A reviewer rejected this record{a.reviewNote ? `: “${a.reviewNote}”` : '.'} <Link to="/corrections">Request a correction</Link> if you believe this is wrong.</>}
                        {a.status === 'present' && (a.reviewStatus === 'confirmed' ? 'Confirmed by a reviewer.' : 'Recorded.')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
