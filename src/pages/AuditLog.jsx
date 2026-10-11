import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import api from '../services/api';
import useResource from '../lib/useResource';
import { errorMessage, formatDateTime, titleCase } from '../lib/format';
import { Card, EmptyState, ErrorState, Field, Loading, PageHeader } from '../ui';

const ACTIONS = {
  'auth.login': 'Signed in',
  'auth.login_failed': 'Failed sign-in',
  'user.created': 'Account created',
  'user.deleted': 'Account deleted',
  'biometric.photo_viewed': 'Enrollment photo viewed',
  'verify.recorded': 'Verification recorded',
  'verify.no_match': 'Verification: no match',
  'attendance.manual_marked': 'Manual attendance',
  'attendance.review_confirmed': 'Review: confirmed',
  'attendance.review_rejected': 'Review: rejected',
  'attendance.cleared': 'All attendance deleted',
  'correction.requested': 'Correction requested',
  'correction.approved': 'Correction approved',
  'correction.denied': 'Correction denied',
  'system.reset': 'System reset',
};

const summarize = (d) => {
  if (!d) return '';
  return Object.entries(d)
    .filter(([, v]) => v !== undefined && v !== null && typeof v !== 'object')
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');
};

export default function AuditLog() {
  const [action, setAction] = useState('');
  const { data, error, loading, reload } = useResource(async () => (await api.get('/audit', { params: { action: action || undefined, limit: 500 } })).data, [action]);

  return (
    <>
      <PageHeader eyebrow="System" title="Audit log" description="Privileged and security-relevant actions, newest first. Entries cannot be edited from the app." />
      <Card>
        <div className="toolbar">
          <Field label="Action" htmlFor="a-action">
            <select id="a-action" className="select" value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">All actions</option>
              {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
        {loading && !data ? <Loading /> : error ? <ErrorState message={errorMessage(error)} onRetry={reload} /> : data.length === 0 ? (
          <EmptyState icon={ScrollText} title="No events" description="Events are recorded from FRAMS 2.0 onwards." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Target</th><th>Details</th></tr></thead>
              <tbody>
                {data.map((e) => (
                  <tr key={e._id}>
                    <td className="mono" style={{ whiteSpace: 'nowrap', fontSize: 'var(--text-xs)' }}>{formatDateTime(e.createdAt)}</td>
                    <td>{ACTIONS[e.action] || e.action}</td>
                    <td>{e.actorName ? <><div>{e.actorName}</div><div className="cell-sub">{titleCase(e.actorRole || '')}</div></> : <span className="muted">—</span>}</td>
                    <td className="mono cell-sub">{e.targetType ? `${e.targetType} ${e.targetId ?? ''}` : '—'}</td>
                    <td className="cell-sub" style={{ maxWidth: 360 }}>{summarize(e.details)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
