import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { FileSearch, Plus } from 'lucide-react';
import api from '../services/api';
import useResource from '../lib/useResource';
import { daysBack, errorMessage, isoDate, METHOD, titleCase } from '../lib/format';
import { Card, Dialog, EmptyState, ErrorState, Field, Loading, Notice, PageHeader, StatusPill } from '../ui';

const PAGE = 50;

export default function Records() {
  const [from, setFrom] = useState(daysBack(30)[0]);
  const [to, setTo] = useState(isoDate());
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const [method, setMethod] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);

  const { data, error, loading, reload } = useResource(
    async () => (await api.get('/attendance', { params: { from: from || undefined, to: to || undefined, status: status || undefined } })).data,
    [from, to, status]
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data || []).filter((r) =>
      (!role || r.role === role) &&
      (!method || (r.method || 'face') === method) &&
      (!needle || r.name?.toLowerCase().includes(needle)));
  }, [data, role, method, q]);

  const visible = rows.slice(page * PAGE, (page + 1) * PAGE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const resetPage = (fn) => (e) => { fn(e.target.value); setPage(0); };

  return (
    <>
      <PageHeader
        eyebrow="Records"
        title="Attendance"
        description="Every attendance record, how it was created and whether a person has reviewed it."
        actions={<button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} aria-hidden="true" /> Manual entry</button>}
      />
      <Card>
        <div className="toolbar" role="search">
          <Field label="Search name" htmlFor="f-q"><input id="f-q" className="input" value={q} onChange={resetPage(setQ)} placeholder="Name" /></Field>
          <Field label="From" htmlFor="f-from"><input id="f-from" type="date" className="input" value={from} max={to || undefined} onChange={resetPage(setFrom)} /></Field>
          <Field label="To" htmlFor="f-to"><input id="f-to" type="date" className="input" value={to} min={from || undefined} onChange={resetPage(setTo)} /></Field>
          <Field label="Status" htmlFor="f-status">
            <select id="f-status" className="select" value={status} onChange={resetPage(setStatus)}>
              <option value="">Any</option><option value="present">Present</option><option value="pending_review">Pending review</option><option value="rejected">Rejected</option>
            </select>
          </Field>
          <Field label="Role" htmlFor="f-role">
            <select id="f-role" className="select" value={role} onChange={resetPage(setRole)}>
              <option value="">Any</option><option value="student">Student</option><option value="faculty">Faculty</option><option value="admin">Admin</option>
            </select>
          </Field>
          <Field label="Method" htmlFor="f-method">
            <select id="f-method" className="select" value={method} onChange={resetPage(setMethod)}>
              <option value="">Any</option><option value="face">Face verification</option><option value="manual">Manual entry</option><option value="correction">Correction</option>
            </select>
          </Field>
        </div>

        {loading && !data ? <Loading /> : error ? <ErrorState message={errorMessage(error)} onRetry={reload} /> : rows.length === 0 ? (
          <EmptyState icon={FileSearch} title="No records match" description="Widen the date range or clear a filter." />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">Attendance records, {rows.length} results</caption>
                <thead>
                  <tr><th>Name</th><th>Date</th><th>Status</th><th>Method</th><th className="right">Similarity</th><th>Risk</th><th>Review</th></tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r._id}>
                      <td><div className="cell-primary">{r.name}</div><div className="cell-sub">{titleCase(r.role)}</div></td>
                      <td className="mono" style={{ whiteSpace: 'nowrap' }}>{r.date}<div className="cell-sub">{r.time}</div></td>
                      <td><StatusPill value={r.status} /></td>
                      <td className="secondary" style={{ whiteSpace: 'nowrap' }}>{METHOD[r.method || 'face']}</td>
                      <td className="right mono">{r.confidenceScore != null ? `${r.confidenceScore}%` : '—'}</td>
                      <td>{(r.method || 'face') === 'face' ? <StatusPill kind="risk" value={r.riskLevel || 'LOW'} /> : <span className="muted">—</span>}</td>
                      <td>{r.reviewStatus && r.reviewStatus !== 'none' ? <StatusPill kind="review" value={r.reviewStatus} /> : <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row-between" style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', fontSize: 'var(--text-xs)' }}>
              <span className="muted">{rows.length} record{rows.length === 1 ? '' : 's'}{data.length >= 5000 && ' (first 5,000 — narrow the dates)'}</span>
              <div className="row">
                <button className="btn btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
                <span className="muted">Page {page + 1} of {pages}</span>
                <button className="btn btn-sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          </>
        )}
      </Card>
      <ManualEntryDialog open={adding} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />
    </>
  );
}

function ManualEntryDialog({ open, onClose, onDone }) {
  const { data: users, error: usersError } = useResource(async () => (open ? (await api.get('/users')).data : []), [open]);
  const [userId, setUserId] = useState('');
  const [date, setDate] = useState(isoDate());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.post('/attendance', { userId, date, note: note.trim() || undefined });
      toast.success('Attendance recorded');
      setUserId(''); setNote('');
      onDone();
    } catch (error) {
      setErr(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Manual attendance entry" description="For when face verification isn’t possible. The entry is marked as manual and recorded in the audit log under your name.">
      <form className="stack" onSubmit={submit}>
        <Field label="Person" htmlFor="m-user">
          <select id="m-user" className="select" value={userId} onChange={(e) => setUserId(e.target.value)} required>
            <option value="">{users ? 'Choose a person' : 'Loading…'}</option>
            {(users || []).map((u) => <option key={u._id} value={u._id}>{u.name} · {u.role}</option>)}
          </select>
        </Field>
        {usersError && <Notice tone="danger">{errorMessage(usersError)}</Notice>}
        <Field label="Day" htmlFor="m-date"><input id="m-date" type="date" className="input" value={date} max={isoDate()} onChange={(e) => setDate(e.target.value)} required /></Field>
        <Field label="Note (optional)" htmlFor="m-note"><input id="m-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Camera unavailable in room 204" /></Field>
        {err && <Notice tone="danger">{err}</Notice>}
        <div className="dialog-footer" style={{ padding: 0 }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !userId}>{busy ? 'Saving…' : 'Record attendance'}</button>
        </div>
      </form>
    </Dialog>
  );
}
