import { Link, useOutletContext } from 'react-router-dom';
import { Activity, ArrowRight, CheckCircle2, MessageSquareWarning, RefreshCw, ScanFace, ShieldQuestion, Users } from 'lucide-react';
import api from '../services/api';
import useResource from '../lib/useResource';
import { daysBack, errorMessage, formatDateTime, isoDate, METHOD, RISK, SIGNAL_TEXT } from '../lib/format';
import { useAuth } from '../context/auth';
import { Card, EmptyState, ErrorState, Loading, Notice, PageHeader, Stat, StatusPill } from '../ui';
import OutcomeChart from '../components/OutcomeChart';

const WINDOW_DAYS = 14;

const loadOverview = async () => {
  const days = daysBack(WINDOW_DAYS);
  const [attendance, queue, corrections, users] = await Promise.all([
    api.get('/attendance', { params: { from: days[0], to: days[days.length - 1] } }),
    api.get('/attendance/review-queue'),
    api.get('/corrections', { params: { status: 'pending' } }),
    api.get('/users'),
  ]);
  return { days, attendance: attendance.data, queue: queue.data, corrections: corrections.data, users: users.data, loadedAt: new Date() };
};

const HEALTH_TEXT = { ok: 'Online', degraded: 'Database unreachable', down: 'Unreachable', checking: 'Checking…' };

export default function Dashboard() {
  const { user } = useAuth();
  const { health } = useOutletContext();
  const { data, error, loading, reload } = useResource(loadOverview);

  if (loading && !data) return <><Header /><Loading label="Loading overview" /></>;
  if (error && !data) return <><Header /><div className="card"><ErrorState message={errorMessage(error)} onRetry={reload} /></div></>;

  const today = isoDate();
  const todays = data.attendance.filter((a) => a.date === today);
  const presentToday = todays.filter((a) => a.status === 'present').length;
  const enrolled = data.users.filter((u) => u.faceEnrolled).length;
  const students = data.users.filter((u) => u.role === 'student');

  const series = data.days.map((date) => {
    const day = data.attendance.filter((a) => a.date === date);
    return {
      date,
      present: day.filter((a) => a.status === 'present').length,
      pending: day.filter((a) => a.status === 'pending_review').length,
      rejected: day.filter((a) => a.status === 'rejected').length,
    };
  });

  const faceRecords = data.attendance.filter((a) => (a.method || 'face') === 'face');
  const riskCounts = ['LOW', 'MEDIUM', 'HIGH'].map((level) => ({ level, n: faceRecords.filter((a) => (a.riskLevel || 'LOW') === level).length }));
  const riskMax = Math.max(1, ...riskCounts.map((r) => r.n));

  return (
    <>
      <Header onRefresh={reload} loading={loading} loadedAt={data.loadedAt} />
      {error && <div style={{ marginBottom: 16 }}><Notice tone="danger">Refresh failed: {errorMessage(error)}. Showing data from {data.loadedAt.toLocaleTimeString()}.</Notice></div>}
      {user.role === 'faculty' && (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="info">You are seeing all records. FRAMS does not yet model classes or course assignments, so access cannot be scoped to your classes.</Notice>
        </div>
      )}

      <div className="stack-lg">
        <div className="grid-stats">
          <Stat label="Present today" icon={CheckCircle2} value={presentToday} foot={`${todays.length} record${todays.length === 1 ? '' : 's'} today in total`} />
          <Stat label="Awaiting review" icon={ShieldQuestion} value={data.queue.length} foot={<Link to="/review">Open review queue</Link>} />
          <Stat label="Correction requests" icon={MessageSquareWarning} value={data.corrections.length} foot={<Link to="/corrections">Pending decisions</Link>} />
          <Stat label="Face-enrolled profiles" icon={Users} value={enrolled} foot={`of ${data.users.length} accounts · ${students.length} students`} />
        </div>

        <div className="grid-2">
          <Card title="Daily outcomes" sub={`Last ${WINDOW_DAYS} days, all methods`}>
            <div className="card-body">
              {data.attendance.length === 0
                ? <EmptyState icon={Activity} title="No attendance in this period" description="Records appear here after the first verification or manual entry." action={<Link className="btn btn-sm" to="/verify"><ScanFace size={14} /> Open verification</Link>} />
                : <OutcomeChart data={series} />}
            </div>
          </Card>

          <div className="stack">
            <Card title="Risk signals" sub={`${faceRecords.length} face verifications, last ${WINDOW_DAYS} days`}>
              <div className="card-body bar-list">
                {riskCounts.map(({ level, n }) => (
                  <div className="bar-list-row" key={level}>
                    <StatusPill kind="risk" value={level} />
                    <div className="bar-track" aria-hidden="true">
                      <div className="bar-fill" style={{ width: `${(n / riskMax) * 100}%`, background: level === 'LOW' ? 'var(--viz-good)' : level === 'MEDIUM' ? 'var(--viz-warning)' : 'var(--viz-critical)' }} />
                    </div>
                    <span className="mono right" aria-label={`${n} ${RISK[level].label} risk`}>{n}</span>
                  </div>
                ))}
                <p className="hint">Risk levels come from fixed rules about scan behaviour. They prompt a closer look; they are not findings.</p>
              </div>
            </Card>

            <Card title="System">
              <dl className="card-body kv">
                <dt>API</dt><dd>{health.state === 'down' ? 'Unreachable' : health.state === 'checking' ? 'Checking…' : 'Online'}</dd>
                <dt>Database</dt><dd>{HEALTH_TEXT[health.state]}</dd>
                <dt>Environment</dt><dd>{health.demoMode ? 'Demo (seeded accounts)' : 'Standard'}</dd>
                <dt>Last check</dt><dd>{health.checkedAt ? health.checkedAt.toLocaleTimeString() : '—'}</dd>
              </dl>
            </Card>
          </div>
        </div>

        <div className="grid-halves">
          <Card title="Needs review" sub="Oldest uncertain outcomes first" actions={<Link className="btn btn-sm btn-ghost" to="/review">All <ArrowRight size={14} /></Link>}>
            {data.queue.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="Nothing waiting" description="Uncertain matches and flagged scans appear here for a human decision." />
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {[...data.queue].reverse().slice(0, 5).map((r) => (
                  <li key={r._id} style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                    <div className="row-between">
                      <span className="cell-primary">{r.name}</span>
                      <span className="mono muted" style={{ fontSize: 11 }}>{r.date} {r.time}</span>
                    </div>
                    <div className="cell-sub">{(r.reviewReasons || []).map((x) => SIGNAL_TEXT[x] || x).join(' ')}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Recent activity" sub="Latest records" actions={<Link className="btn btn-sm btn-ghost" to="/records">All <ArrowRight size={14} /></Link>}>
            {data.attendance.length === 0 ? (
              <EmptyState title="No records yet" />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <tbody>
                    {data.attendance.slice(0, 7).map((r) => (
                      <tr key={r._id}>
                        <td><div className="cell-primary">{r.name}</div><div className="cell-sub">{METHOD[r.method || 'face']}</div></td>
                        <td><StatusPill value={r.status} /></td>
                        <td className="right mono muted" style={{ fontSize: 11 }}>{formatDateTime(r.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Header({ onRefresh, loading, loadedAt }) {
  return (
    <PageHeader
      eyebrow="Trust console"
      title="Overview"
      description="Today’s attendance, what needs a human decision, and how verification has been behaving."
      actions={onRefresh && (
        <>
          {loadedAt && <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>Updated {loadedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
          <button className="btn" onClick={onRefresh} disabled={loading}><RefreshCw size={14} aria-hidden="true" /> Refresh</button>
          <Link className="btn btn-primary" to="/verify"><ScanFace size={16} aria-hidden="true" /> Verify</Link>
        </>
      )}
    />
  );
}
