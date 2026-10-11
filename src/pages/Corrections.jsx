import { useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, Inbox, Plus, XCircle } from 'lucide-react';
import api from '../services/api';
import useResource from '../lib/useResource';
import { useAuth } from '../context/auth';
import { errorMessage, formatDateTime, formatDay, isoDate } from '../lib/format';
import { Card, Dialog, EmptyState, ErrorState, Field, Loading, Notice, PageHeader, StatusPill } from '../ui';

const loadAll = (status) => async () => (await api.get('/corrections', { params: status ? { status } : {} })).data;

export default function Corrections() {
  const { user } = useAuth();
  const staff = user.role !== 'student';
  const [filter, setFilter] = useState(staff ? 'pending' : '');
  const { data, error, loading, reload } = useResource(loadAll(filter), [filter]);
  const [creating, setCreating] = useState(false);
  const [resolving, setResolving] = useState(null);

  return (
    <>
      <PageHeader
        eyebrow={staff ? 'Corrections' : 'My requests'}
        title="Attendance corrections"
        description={staff
          ? 'Requests from people who believe a day is missing or wrong. Approving creates or confirms the attendance record; every decision is logged.'
          : 'If a day is missing or wrong — the camera was down, you weren’t recognised, or a record was rejected — ask for a correction here.'}
        actions={!staff && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" /> New request</button>}
      />

      {staff && (
        <div className="segmented" role="group" aria-label="Show" style={{ marginBottom: 16 }}>
          {[['pending', 'Pending'], ['approved', 'Approved'], ['denied', 'Denied'], ['', 'All']].map(([k, label]) => (
            <button key={label} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>
      )}

      <Card>
        {loading && !data ? <Loading /> : error ? <ErrorState message={errorMessage(error)} onRetry={reload} /> : data.length === 0 ? (
          <EmptyState icon={Inbox} title={staff ? 'No requests here' : 'You haven’t made any requests'}
            description={staff ? 'New requests from students and staff will appear here.' : 'Requests you submit and their outcomes will be listed here.'}
            action={!staff && <button className="btn btn-sm" onClick={() => setCreating(true)}><Plus size={14} /> New request</button>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {staff && <th>Person</th>}
                  <th>Day</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Decision</th>
                  {staff && <th className="right"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c._id}>
                    {staff && <td className="cell-primary">{c.userName}</td>}
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDay(c.date)}<div className="cell-sub">asked {formatDateTime(c.createdAt)}</div></td>
                    <td style={{ maxWidth: 360 }}>{c.reason}</td>
                    <td><StatusPill kind="correction" value={c.status} /></td>
                    <td className="cell-sub" style={{ maxWidth: 260 }}>
                      {c.status === 'pending' ? '—' : <>{c.resolvedByName} · {formatDateTime(c.resolvedAt)}{c.resolutionNote && <div style={{ color: 'var(--text-secondary)' }}>“{c.resolutionNote}”</div>}</>}
                    </td>
                    {staff && (
                      <td className="right">
                        {c.status === 'pending' && <button className="btn btn-sm" onClick={() => setResolving(c)}>Decide</button>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {!staff && <NewRequestDialog open={creating} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); reload(); }} />}
      {staff && <ResolveDialog request={resolving} onClose={() => setResolving(null)} onResolved={() => { setResolving(null); reload(); }} />}
    </>
  );
}

function NewRequestDialog({ open, onClose, onCreated }) {
  const [date, setDate] = useState(isoDate());
  const [reason, setReason] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.post('/corrections', { date, reason: reason.trim() });
      toast.success('Request sent. You’ll see the decision here.');
      setReason('');
      onCreated();
    } catch (error) {
      setErr(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Request a correction" description="A faculty member will review your request. Be specific — it helps them decide quickly.">
      <form id="correction-form" className="stack" onSubmit={submit}>
        <Field label="Day" htmlFor="corr-date">
          <input id="corr-date" type="date" className="input" value={date} max={isoDate()} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="What happened?" htmlFor="corr-reason" hint={`${reason.trim().length}/1000 · at least 10 characters`}>
          <textarea id="corr-reason" className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} required
            placeholder="e.g. I attended the 9:00 lecture but the kiosk said no matching profile three times." />
        </Field>
        {err && <Notice tone="danger">{err}</Notice>}
        <div className="dialog-footer" style={{ padding: 0 }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || reason.trim().length < 10}>{busy ? 'Sending…' : 'Send request'}</button>
        </div>
      </form>
    </Dialog>
  );
}

function ResolveDialog({ request, onClose, onResolved }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  const decide = async (decision) => {
    setBusy(decision);
    setErr(null);
    try {
      await api.patch(`/corrections/${request._id}`, { decision, note: note.trim() || undefined });
      toast.success(decision === 'approve' ? 'Approved — attendance recorded' : 'Request denied');
      setNote('');
      onResolved();
    } catch (error) {
      setErr(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={Boolean(request)} onClose={() => { setNote(''); setErr(null); onClose(); }} title="Decide on correction"
      description={request && `${request.userName} · ${formatDay(request.date)}`}
      footer={
        <>
          <button className="btn btn-danger" disabled={Boolean(busy) || note.trim().length < 3} onClick={() => decide('deny')}><XCircle size={16} aria-hidden="true" /> Deny</button>
          <button className="btn btn-primary" disabled={Boolean(busy)} onClick={() => decide('approve')}><CheckCircle2 size={16} aria-hidden="true" /> Approve</button>
        </>
      }>
      {request && <blockquote style={{ margin: 0, padding: '12px 14px', borderLeft: '2px solid var(--border-strong)', background: 'var(--surface-sunken)', borderRadius: 4 }}>{request.reason}</blockquote>}
      <Field label="Note to the requester" htmlFor="resolve-note" hint="Required when denying. Shown to the requester and kept in the audit log.">
        <textarea id="resolve-note" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      </Field>
      {err && <Notice tone="danger">{err}</Notice>}
    </Dialog>
  );
}
