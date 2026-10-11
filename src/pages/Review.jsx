import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Bot, CheckCircle2, Eye, Gavel, Image as ImageIcon, ShieldQuestion, XCircle } from 'lucide-react';
import api from '../services/api';
import useResource from '../lib/useResource';
import { errorMessage, formatDateTime, METHOD, SIGNAL_TEXT } from '../lib/format';
import { Card, EmptyState, ErrorState, Field, Loading, Notice, PageHeader, StatusPill } from '../ui';

const VIEWS = [
  ['pending', 'Awaiting review'],
  ['confirmed', 'Confirmed'],
  ['rejected', 'Rejected'],
];

const load = (view) => async () =>
  (view === 'pending' ? await api.get('/attendance/review-queue') : await api.get('/attendance', { params: { reviewStatus: view } })).data;

export default function Review() {
  const [view, setView] = useState('pending');
  const { data, error, loading, reload } = useResource(load(view), [view]);
  const [selectedId, setSelectedId] = useState(null);

  const records = data || [];
  const selected = records.find((r) => r._id === selectedId) || records[0] || null;

  return (
    <>
      <PageHeader
        eyebrow="Anomaly review"
        title="Review queue"
        description="Scans the system was not confident about. Look at the evidence, then confirm or reject. Nothing here is treated as wrongdoing until a person decides."
      />
      <div className="segmented" role="group" aria-label="Show" style={{ marginBottom: 16 }}>
        {VIEWS.map(([key, label]) => (
          <button key={key} type="button" aria-pressed={view === key} onClick={() => { setView(key); setSelectedId(null); }}>{label}</button>
        ))}
      </div>

      {loading && !data ? <Loading /> : error ? <div className="card"><ErrorState message={errorMessage(error)} onRetry={reload} /></div> : records.length === 0 ? (
        <div className="card">
          <EmptyState icon={CheckCircle2} title={view === 'pending' ? 'The queue is clear' : 'Nothing here yet'}
            description={view === 'pending' ? 'Uncertain matches, behaviour deviations and high-risk scans will appear here.' : 'Decided records will be listed here.'} />
        </div>
      ) : (
        <div className="grid-2" style={{ gridTemplateColumns: undefined }}>
          <Detail key={selected._id} record={selected} onDecided={() => { setSelectedId(null); reload(); }} />
          <Card title={`${records.length} record${records.length === 1 ? '' : 's'}`}>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 640, overflowY: 'auto' }}>
              {records.map((r) => (
                <li key={r._id}>
                  <button type="button" onClick={() => setSelectedId(r._id)} aria-current={selected._id === r._id}
                    style={{ all: 'unset', boxSizing: 'border-box', display: 'block', width: '100%', cursor: 'pointer', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: selected._id === r._id ? 'var(--surface-raised)' : 'transparent', borderLeft: `2px solid ${selected._id === r._id ? 'var(--accent)' : 'transparent'}` }}>
                    <div className="row-between"><span className="cell-primary">{r.name}</span><StatusPill kind="risk" value={r.riskLevel} /></div>
                    <div className="cell-sub">{r.date} · {r.time} · {(r.reviewReasons || []).length} signal{(r.reviewReasons || []).length === 1 ? '' : 's'}</div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}

function Detail({ record: r, onDecided }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [history, setHistory] = useState(null);

  useEffect(() => {
    if (!r.userId) return;
    let alive = true;
    api.get('/attendance', { params: { userId: r.userId } })
      .then(({ data }) => alive && setHistory(data.filter((x) => x._id !== r._id).slice(0, 6)))
      .catch(() => alive && setHistory([]));
    return () => { alive = false; };
  }, [r._id, r.userId]);

  const decide = async (decision) => {
    setBusy(decision);
    try {
      await api.patch(`/attendance/${r._id}/review`, { decision, note: note.trim() || undefined });
      toast.success(decision === 'confirm' ? `${r.name} confirmed present` : 'Record rejected');
      onDecided();
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(null);
    }
  };

  const viewPhoto = async () => {
    try {
      const { data } = await api.get(`/users/${r.userId}/photo`);
      setPhoto(data.faceImage);
    } catch (err) {
      setPhoto({ error: errorMessage(err) });
    }
  };

  const pending = r.reviewStatus === 'pending';
  const liveness = r.liveness || {};

  return (
    <Card title={r.name} sub={`${r.role} · ${METHOD[r.method || 'face']}`} actions={<StatusPill value={r.status} />}>
      <div className="card-body stack">
        <section className="evidence-group" aria-labelledby="ev-facts">
          <h3 className="evidence-head" id="ev-facts"><Eye size={14} aria-hidden="true" /> Observed facts</h3>
          <dl className="kv">
            <dt>Date & time</dt><dd>{r.date} at {r.time}</dd>
            <dt>Recorded</dt><dd>{formatDateTime(r.createdAt)}</dd>
            <dt>Method</dt><dd>{METHOD[r.method || 'face']}</dd>
            <dt>Enrollment photo</dt>
            <dd>
              {photo ? (photo.error ? <span className="field-error">{photo.error}</span>
                : <img src={photo} alt={`Enrollment photo of ${r.name}`} style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border-strong)' }} />)
                : r.userId ? <button className="btn btn-sm" onClick={viewPhoto}><ImageIcon size={14} aria-hidden="true" /> View (logged)</button> : '—'}
            </dd>
          </dl>
        </section>

        <section className="evidence-group" aria-labelledby="ev-signals">
          <h3 className="evidence-head" id="ev-signals"><Bot size={14} aria-hidden="true" /> Model-generated signals</h3>
          <dl className="kv">
            <dt>Face similarity</dt><dd>{r.confidenceScore != null ? `${r.confidenceScore}%` : '—'}{r.matchDistance != null && <span className="muted"> (distance {r.matchDistance})</span>}</dd>
            <dt>Liveness</dt><dd>{liveness.frames != null ? `${liveness.blinkCount} blink(s), ${liveness.movementScore?.toFixed?.(1)} px movement, ${liveness.frames} frames, ${(liveness.scanTimeMs / 1000).toFixed(1)} s` : '—'} <span className="muted">· measured in browser</span></dd>
            <dt>Behaviour match</dt><dd>{r.behaviorSimilarity != null ? `${Math.round(r.behaviorSimilarity * 100)}%` : '—'}</dd>
            <dt>Risk</dt><dd><StatusPill kind="risk" value={r.riskLevel} /> <span className="muted mono">score {r.riskScore ?? 0}</span></dd>
          </dl>
          {(r.reviewReasons || []).length > 0 && (
            <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 'var(--text-sm)' }} className="secondary">
              {r.reviewReasons.map((x) => <li key={x}>{SIGNAL_TEXT[x] || x}</li>)}
            </ul>
          )}
        </section>

        <section className="evidence-group" aria-labelledby="ev-decision">
          <h3 className="evidence-head" id="ev-decision"><Gavel size={14} aria-hidden="true" /> Human decision</h3>
          {pending ? (
            <div className="stack">
              <Field label="Note" htmlFor="review-note" hint="Required when rejecting. Visible to staff and recorded in the audit log.">
                <textarea id="review-note" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Confirmed in person; poor lighting at the kiosk" />
              </Field>
              <div className="row">
                <button className="btn btn-primary" disabled={Boolean(busy)} onClick={() => decide('confirm')}><CheckCircle2 size={16} aria-hidden="true" /> {busy === 'confirm' ? 'Saving…' : 'Confirm present'}</button>
                <button className="btn btn-danger" disabled={Boolean(busy) || note.trim().length < 3} onClick={() => decide('reject')}><XCircle size={16} aria-hidden="true" /> {busy === 'reject' ? 'Saving…' : 'Reject record'}</button>
              </div>
            </div>
          ) : (
            <dl className="kv">
              <dt>Decision</dt><dd><StatusPill kind="review" value={r.reviewStatus} /></dd>
              <dt>Decided</dt><dd>{formatDateTime(r.reviewedAt)}</dd>
              <dt>Note</dt><dd>{r.reviewNote || '—'}</dd>
            </dl>
          )}
        </section>

        <section aria-labelledby="ev-history">
          <h3 className="evidence-head" id="ev-history"><ShieldQuestion size={14} aria-hidden="true" /> Other records for {r.name}</h3>
          {history === null ? <div className="skeleton" style={{ height: 40 }} /> : history.length === 0 ? <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>No other records.</p> : (
            <div className="row" style={{ gap: 6 }}>
              {history.map((h) => <span key={h._id} className="tag" title={`${h.status} · ${h.riskLevel || 'LOW'} risk`}>{h.date} · {h.status === 'present' ? '✓' : h.status === 'rejected' ? '✕' : '?'}</span>)}
            </div>
          )}
        </section>

        {r.riskLevel === 'HIGH' && pending && (
          <Notice tone="warning">A high risk level means several unusual signals occurred together. Common innocent causes: poor lighting, glasses, a rushed scan, or a camera change.</Notice>
        )}
      </div>
    </Card>
  );
}
