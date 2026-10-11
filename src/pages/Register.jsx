import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Camera, CameraOff, Copy, RefreshCw, ScanFace, UserPlus } from 'lucide-react';
import api from '../services/api';
import { faceService } from '../services/faceService';
import { CAMERA_ERRORS, classifyCameraError, measureBrightness, openCamera, stopStream } from '../lib/camera';
import { qualityIssue } from '../lib/liveness';
import { errorMessage } from '../lib/format';
import { Card, Field, Notice, PageHeader } from '../ui';

const EMPTY = { name: '', email: '', password: '', role: 'student', department: '', researchPapers: '' };
const SNAPSHOT_WIDTH = 480;

export default function Enroll() {
  const videoRef = useRef(null);
  const probeRef = useRef(null);
  const streamRef = useRef(null);
  const [form, setForm] = useState(EMPTY);
  const [camera, setCamera] = useState({ state: 'off' }); // off | starting | on | error
  const [capture, setCapture] = useState(null); // { descriptor, image }
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);

  useEffect(() => () => stopStream(streamRef.current), []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const startCamera = async () => {
    setCamera({ state: 'starting' });
    try {
      await faceService.loadModels();
      const stream = await openCamera();
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCamera({ state: 'on' });
    } catch (err) {
      const kind = err?.name ? classifyCameraError(err) : 'unknown';
      setCamera({ state: 'error', ...(err?.name || err?.message === 'unsupported' ? CAMERA_ERRORS[kind] : { title: 'Face models failed to load', text: 'Check that /models is served and try again.' }) });
    }
  };

  const stopCamera = () => {
    stopStream(streamRef.current);
    streamRef.current = null;
    setCamera({ state: 'off' });
  };

  const takeCapture = async () => {
    setBusy('capture');
    setError(null);
    try {
      const video = videoRef.current;
      const detections = await faceService.detectAllFaces(video);
      const issue = qualityIssue({
        faceCount: detections.length,
        faceWidth: detections[0]?.detection.box.width,
        frameWidth: video.videoWidth,
        brightness: measureBrightness(video, probeRef.current),
      });
      if (issue) {
        setError(issue.text);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = SNAPSHOT_WIDTH;
      canvas.height = Math.round((video.videoHeight / video.videoWidth) * SNAPSHOT_WIDTH);
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      setCapture({ descriptor: Array.from(detections[0].descriptor), image: canvas.toDataURL('image/jpeg', 0.85) });
      stopCamera();
    } catch (err) {
      setError(errorMessage(err, 'Face capture failed'));
    } finally {
      setBusy(null);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy('save');
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        password: form.password || undefined,
        role: form.role,
        department: form.department.trim() || undefined,
        researchPapers: form.role === 'student' ? undefined : form.researchPapers || undefined,
        ...(capture ? { faceDescriptor: capture.descriptor, faceImage: capture.image } : {}),
      };
      const { data } = await api.post('/users', payload);
      setCreated(data);
      setForm(EMPTY);
      setCapture(null);
      setConsent(false);
      toast.success(`${data.name} added`);
    } catch (err) {
      setError(errorMessage(err, 'Could not create the account'));
    } finally {
      setBusy(null);
    }
  };

  const canSave = form.name.trim() && (!capture || consent) && !busy;

  return (
    <>
      <PageHeader
        eyebrow="Directory"
        title="Add a person"
        description="Create an account and, with the person’s consent, enroll their face for verification."
        actions={<Link className="btn btn-ghost" to="/people"><ArrowLeft size={16} aria-hidden="true" /> Back to people</Link>}
      />

      {created && (
        <div style={{ marginBottom: 16 }}>
          <Notice tone="info" title={`${created.name} was added.`}>
            Sign-in email: <span className="mono">{created.email}</span>.{' '}
            {created.temporaryPassword ? (
              <>Temporary password (shown once): <span className="mono">{created.temporaryPassword}</span>{' '}
                <button className="btn btn-sm btn-ghost" onClick={() => navigator.clipboard?.writeText(created.temporaryPassword).then(() => toast.success('Copied'))}><Copy size={12} /> Copy</button>
              </>
            ) : 'They sign in with the password you set.'}
            {!created.faceEnrolled && ' No face was enrolled; they can only be marked manually.'}
          </Notice>
        </div>
      )}

      <form className="grid-halves" onSubmit={submit}>
        <Card title="Account">
          <div className="card-body stack">
            <div className="form-grid">
              <Field label="Full name" htmlFor="e-name"><input id="e-name" className="input" value={form.name} onChange={set('name')} required maxLength={120} autoComplete="off" /></Field>
              <Field label="Role" htmlFor="e-role">
                <select id="e-role" className="select" value={form.role} onChange={set('role')}>
                  <option value="student">Student</option><option value="faculty">Faculty</option><option value="admin">Admin</option>
                </select>
              </Field>
              <Field label="Email" htmlFor="e-email" hint="Leave blank to generate one"><input id="e-email" type="email" className="input" value={form.email} onChange={set('email')} autoComplete="off" /></Field>
              <Field label="Password" htmlFor="e-pass" hint="Leave blank to generate a one-time password"><input id="e-pass" type="password" className="input" value={form.password} onChange={set('password')} minLength={8} autoComplete="new-password" /></Field>
              <Field label="Department" htmlFor="e-dept"><input id="e-dept" className="input" value={form.department} onChange={set('department')} maxLength={120} /></Field>
              {form.role !== 'student' && (
                <Field label="Research papers" htmlFor="e-papers"><input id="e-papers" type="number" min="0" step="1" className="input" value={form.researchPapers} onChange={set('researchPapers')} /></Field>
              )}
            </div>
            {form.role === 'admin' && <Notice tone="warning">Admins can delete people and all attendance data. Grant this role sparingly.</Notice>}
          </div>
        </Card>

        <Card title="Face enrollment" sub="Optional · needed for face verification">
          <div className="card-body stack">
            <div className="viewport" style={{ aspectRatio: '4 / 3' }}>
              <video ref={videoRef} muted playsInline aria-label="Camera preview" style={{ display: capture ? 'none' : undefined }} />
              <canvas ref={probeRef} hidden />
              {capture && <img src={capture.image} alt="Captured enrollment photo" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />}
              {!capture && camera.state !== 'on' && (
                <div className="viewport-overlay">
                  {camera.state === 'starting' ? <div className="spinner" role="status" aria-label="Starting camera" /> : camera.state === 'error' ? (
                    <div className="stack" style={{ alignItems: 'center' }} role="alert"><CameraOff size={20} aria-hidden="true" /><strong>{camera.title}</strong><span className="muted" style={{ fontSize: 'var(--text-sm)' }}>{camera.text}</span><button type="button" className="btn btn-sm" onClick={startCamera}>Try again</button></div>
                  ) : (
                    <div className="stack" style={{ alignItems: 'center' }}><ScanFace size={20} aria-hidden="true" /><span className="muted" style={{ fontSize: 'var(--text-sm)' }}>Face the camera in even light, without a mask or sunglasses.</span><button type="button" className="btn" onClick={startCamera}><Camera size={16} aria-hidden="true" /> Start camera</button></div>
                  )}
                </div>
              )}
            </div>
            <div className="row">
              {camera.state === 'on' && <button type="button" className="btn btn-primary" onClick={takeCapture} disabled={busy === 'capture'}>{busy === 'capture' ? 'Checking…' : 'Capture face'}</button>}
              {capture && <button type="button" className="btn" onClick={() => { setCapture(null); startCamera(); }}><RefreshCw size={14} aria-hidden="true" /> Retake</button>}
            </div>
            {capture && (
              <label className="row" style={{ alignItems: 'flex-start', gap: 10, fontSize: 'var(--text-sm)' }}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
                <span className="secondary">This person has agreed to their face descriptor and a photo being stored for attendance verification, and knows they can ask for it to be deleted.</span>
              </label>
            )}
          </div>
        </Card>

        <div style={{ gridColumn: '1 / -1' }} className="stack">
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="row">
            <button className="btn btn-primary btn-lg" disabled={!canSave}><UserPlus size={16} aria-hidden="true" /> {busy === 'save' ? 'Saving…' : capture ? 'Create account and enroll face' : 'Create account without face'}</button>
            {capture && !consent && <span className="hint">Confirm consent to enroll the face.</span>}
          </div>
        </div>
      </form>
    </>
  );
}
