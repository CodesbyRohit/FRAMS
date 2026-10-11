import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ScanFace, Trash2, UserPlus, Users } from 'lucide-react';
import api from '../services/api';
import useResource from '../lib/useResource';
import { useAuth } from '../context/auth';
import { errorMessage, formatDateTime, titleCase } from '../lib/format';
import { Card, Dialog, EmptyState, ErrorState, Field, Loading, Notice, PageHeader, Pill } from '../ui';

export default function People() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const { data, error, loading, reload } = useResource(async () => (await api.get('/users')).data);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [removing, setRemoving] = useState(null);
  const [danger, setDanger] = useState(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data || []).filter((u) => (!role || u.role === role) &&
      (!needle || u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle) || (u.department || '').toLowerCase().includes(needle)));
  }, [data, q, role]);

  return (
    <>
      <PageHeader
        eyebrow="Directory"
        title="People"
        description={isAdmin ? 'Accounts and face enrollment. Face data is never shown in this list.' : 'Accounts you can mark attendance for. Read-only.'}
        actions={isAdmin && <Link className="btn btn-primary" to="/people/enroll"><UserPlus size={16} aria-hidden="true" /> Add person</Link>}
      />

      <Card>
        <div className="toolbar" role="search">
          <Field label="Search" htmlFor="p-q"><input id="p-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email or department" /></Field>
          <Field label="Role" htmlFor="p-role">
            <select id="p-role" className="select" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">Any</option><option value="student">Student</option><option value="faculty">Faculty</option><option value="admin">Admin</option>
            </select>
          </Field>
        </div>
        {loading && !data ? <Loading /> : error ? <ErrorState message={errorMessage(error)} onRetry={reload} /> : rows.length === 0 ? (
          <EmptyState icon={Users} title={data.length ? 'No one matches' : 'No accounts yet'} action={isAdmin && !data.length && <Link className="btn btn-sm" to="/people/enroll">Add the first person</Link>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Face enrollment</th><th>Flags</th>{isAdmin && <th className="right"><span className="sr-only">Actions</span></th>}</tr></thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u._id}>
                    <td><div className="cell-primary">{u.name}</div><div className="cell-sub">{u.email}</div></td>
                    <td>{titleCase(u.role)}</td>
                    <td className="secondary">{u.department || '—'}</td>
                    <td>{u.faceEnrolled ? <Pill tone="success" icon={ScanFace}>Enrolled{u.faceEnrolledAt && <span className="muted" style={{ fontWeight: 400 }}>&nbsp;{formatDateTime(u.faceEnrolledAt)}</span>}</Pill> : <Pill>Not enrolled</Pill>}</td>
                    <td className="mono" title="Times a verification for this person reached HIGH risk">{u.riskProfile?.anomalyCount ?? 0}</td>
                    {isAdmin && (
                      <td className="right">
                        {u._id !== user.id && (
                          <button className="btn btn-ghost btn-sm" onClick={() => setRemoving(u)} aria-label={`Delete ${u.name}`}><Trash2 size={14} aria-hidden="true" /></button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {isAdmin && (
        <Card title="Danger zone" sub="Irreversible. Both actions are recorded in the audit log." style={{ marginTop: 24, borderColor: 'rgba(242,122,122,0.35)' }}>
          <div className="card-body row">
            <button className="btn btn-danger" onClick={() => setDanger('attendance')}>Delete all attendance records</button>
            <button className="btn btn-danger" onClick={() => setDanger('users')}>Delete all other accounts</button>
          </div>
        </Card>
      )}

      <RemoveDialog person={removing} onClose={() => setRemoving(null)} onDone={() => { setRemoving(null); reload(); }} />
      <DangerDialog kind={danger} onClose={() => setDanger(null)} onDone={() => { setDanger(null); reload(); }} />
    </>
  );
}

function RemoveDialog({ person, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    try {
      const { data } = await api.delete(`/users/${person._id}`);
      toast.success(data.message);
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={Boolean(person)} onClose={onClose} title={`Delete ${person?.name ?? ''}?`}
      description="Their account, face descriptor and enrollment photo are deleted. Their past attendance records are kept for reporting."
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-danger" onClick={remove} disabled={busy}>{busy ? 'Deleting…' : 'Delete account'}</button></>} />
  );
}

const DANGER = {
  attendance: { title: 'Delete all attendance records', phrase: 'CLEAR ALL ATTENDANCE', url: '/attendance/clear', text: 'Every attendance record for every person is permanently deleted. Accounts and face enrollments are kept.' },
  users: { title: 'Delete all other accounts', phrase: 'DELETE ALL USERS', url: '/users/bulk/clear', text: 'Every account except yours, all face data, and all attendance records are permanently deleted.' },
};

function DangerDialog({ kind, onClose, onDone }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const d = DANGER[kind];

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const { data } = await api.delete(d.url, { data: { confirm: typed } });
      toast.success(data.message);
      setTyped('');
      onDone();
    } catch (error) {
      setErr(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={Boolean(d)} onClose={() => { setTyped(''); setErr(null); onClose(); }} title={d?.title}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-danger" disabled={busy || typed !== d?.phrase} onClick={run}>{busy ? 'Working…' : 'I understand, delete'}</button></>}>
      {d && (
        <>
          <Notice tone="danger">{d.text} This cannot be undone.</Notice>
          <Field label={<>Type <span className="mono">{d.phrase}</span> to confirm</>} htmlFor="danger-confirm">
            <input id="danger-confirm" className="input mono" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </Field>
          {err && <Notice tone="danger">{err}</Notice>}
        </>
      )}
    </Dialog>
  );
}
