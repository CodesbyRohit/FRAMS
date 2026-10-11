import { useState } from 'react';
import Papa from 'papaparse';
import toast from 'react-hot-toast';
import { FileSpreadsheet, Users } from 'lucide-react';
import api from '../services/api';
import { daysBack, errorMessage, isoDate, METHOD } from '../lib/format';
import { Card, Field, Notice, PageHeader } from '../ui';

const download = (rows, name) => {
  const blob = new Blob([Papa.unparse(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `${name}_${isoDate()}.csv` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export default function Export() {
  const [from, setFrom] = useState(daysBack(30)[0]);
  const [to, setTo] = useState(isoDate());
  const [scope, setScope] = useState('all');
  const [busy, setBusy] = useState(null);

  const run = async (kind) => {
    setBusy(kind);
    try {
      if (kind === 'attendance') {
        const [{ data: records }, { data: users }] = await Promise.all([
          api.get('/attendance', { params: { from, to } }),
          api.get('/users'),
        ]);
        const byId = new Map(users.map((u) => [u._id, u]));
        const rows = records
          .filter((r) => scope === 'all' || (scope === 'students' ? r.role === 'student' : r.role !== 'student'))
          .map((r) => {
            const u = byId.get(r.userId);
            return {
              Name: r.name, Role: r.role, Department: u?.department || '', ...(scope === 'staff' ? { 'Research Papers': u?.researchPapers ?? '' } : {}),
              Date: r.date, Time: r.time, Status: r.status, Method: METHOD[r.method || 'face'],
              'Similarity %': r.confidenceScore ?? '', 'Risk Level': (r.method || 'face') === 'face' ? r.riskLevel || 'LOW' : '', 'Review': r.reviewStatus || 'none',
            };
          });
        if (!rows.length) return toast.error('No records in that range');
        download(rows, `attendance_${scope}`);
      } else {
        const { data: users } = await api.get('/users');
        if (!users.length) return toast.error('No accounts to export');
        download(users.map((u) => ({
          Name: u.name, Email: u.email, Role: u.role, Department: u.department || '', 'Face Enrolled': u.faceEnrolled ? 'yes' : 'no',
          'Date Joined': u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '',
        })), 'people');
      }
      toast.success('Export downloaded');
    } catch (err) {
      toast.error(errorMessage(err, 'Export failed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Records" title="Export" description="Download CSV files for reporting. Exports never include face data or photos." />
      <div className="grid-halves">
        <Card title="Attendance records">
          <div className="card-body stack">
            <div className="form-grid">
              <Field label="From" htmlFor="x-from"><input id="x-from" type="date" className="input" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label="To" htmlFor="x-to"><input id="x-to" type="date" className="input" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
            </div>
            <Field label="Who" htmlFor="x-scope">
              <select id="x-scope" className="select" value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="all">Everyone</option><option value="students">Students</option><option value="staff">Faculty & admin (with research papers)</option>
              </select>
            </Field>
            <button className="btn btn-primary" onClick={() => run('attendance')} disabled={Boolean(busy)}><FileSpreadsheet size={16} aria-hidden="true" /> {busy === 'attendance' ? 'Preparing…' : 'Download attendance CSV'}</button>
          </div>
        </Card>
        <Card title="People">
          <div className="card-body stack">
            <p className="secondary" style={{ fontSize: 'var(--text-sm)' }}>Names, emails, roles, departments and whether a face is enrolled.</p>
            <button className="btn" onClick={() => run('people')} disabled={Boolean(busy)}><Users size={16} aria-hidden="true" /> {busy === 'people' ? 'Preparing…' : 'Download people CSV'}</button>
            <Notice tone="warning">CSV files contain personal data. Store and share them according to your institution’s data policy.</Notice>
          </div>
        </Card>
      </div>
    </>
  );
}
