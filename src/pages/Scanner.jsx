import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Camera, CameraOff, CheckCircle2, Clock, Eye, Image as ImageIcon, RefreshCw, ScanFace, ShieldQuestion, UserX, Users, Volume2, VolumeX, XCircle,
} from 'lucide-react';
import api from '../services/api';
import { faceService } from '../services/faceService';
import voiceService from '../services/voiceService';
import { CAMERA_ERRORS, classifyCameraError, measureBrightness, openCamera, stopStream } from '../lib/camera';
import * as live from '../lib/liveness';
import { errorMessage, isoDate, SIGNAL_TEXT } from '../lib/format';
import { Card, Notice, PageHeader, Pill, StatusPill } from '../ui';

const DETECT_INTERVAL_MS = 150;
const RESULT_HOLD_MS = 6000;
const FACE_LOST_RESET_MS = 1200;
// Shown until the first detection pass completes (the first inference can take seconds).
const SEARCHING = { code: 'searching', text: 'Looking for a face…' };

// Server decision → how the outcome panel presents it.
const OUTCOME = {
  marked: { tone: 'success', icon: CheckCircle2, title: 'Marked present', say: 'Marked present.' },
  already_marked: { tone: 'neutral', icon: Clock, title: 'Already recorded today', say: 'Already recorded today.' },
  pending_review: { tone: 'warning', icon: ShieldQuestion, title: 'Sent for faculty review', say: 'Recorded for review.' },
  no_match: { tone: 'danger', icon: UserX, title: 'No matching profile', say: 'No matching profile found.' },
  liveness_incomplete: { tone: 'warning', icon: Eye, title: 'Need a little more', say: null },
  multiple_faces: { tone: 'warning', icon: Users, title: 'More than one face', say: 'One person at a time, please.' },
};

const STAGES = [
  ['camera', 'Camera & consent'],
  ['quality', 'Face & frame quality'],
  ['liveness', 'Liveness signals'],
  ['match', 'Identity match'],
  ['risk', 'Risk assessment'],
  ['decision', 'Attendance decision'],
];

function StageIcon({ status, index }) {
  if (status === 'passed') return <CheckCircle2 size={14} aria-hidden="true" />;
  if (status === 'failed') return <XCircle size={14} aria-hidden="true" />;
  if (status === 'uncertain' || status === 'flagged') return <ShieldQuestion size={14} aria-hidden="true" />;
  return <span aria-hidden="true">{index + 1}</span>;
}

const STATUS_WORD = { pending: 'Waiting', active: 'In progress', passed: 'Passed', failed: 'Did not pass', uncertain: 'Uncertain', flagged: 'Flagged', info: 'Info' };

export default function Verify() {
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const probeRef = useRef(null);
  const streamRef = useRef(null);
  const loopRef = useRef({ running: false, timer: null });
  const trackerRef = useRef(null);
  const lastSeenRef = useRef(0);
  const lastBrightnessRef = useRef({ at: 0, value: null });
  const busyRef = useRef(false);
  const holdTimerRef = useRef(null);

  // phase: idle | loading | camera | scanning | submitting | result | error
  const [phase, setPhase] = useState('idle');
  const [failure, setFailure] = useState(null); // { kind, title, text }
  const [quality, setQuality] = useState(null);
  const [progress, setProgress] = useState({ frames: 0, movement: 0, blink: 0 });
  const [result, setResult] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [todayCount, setTodayCount] = useState(null);
  const [session, setSession] = useState([]);
  const [voice, setVoice] = useState(voiceService.isEnabled());

  const refreshCount = useCallback(() => {
    const today = isoDate();
    api.get('/attendance', { params: { from: today, to: today, status: 'present' } })
      .then(({ data }) => setTodayCount(data.length))
      .catch(() => setTodayCount(null));
  }, []);

  useEffect(() => { refreshCount(); }, [refreshCount]);

  const say = (text) => text && voiceService.speak(text, true);

  const resetTracking = () => {
    trackerRef.current = null;
    setProgress({ frames: 0, movement: 0, blink: 0 });
  };

  const stopLoop = () => {
    loopRef.current.running = false;
    clearTimeout(loopRef.current.timer);
  };

  const shutdown = useCallback(() => {
    stopLoop();
    clearTimeout(holdTimerRef.current);
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => shutdown, [shutdown]);

  // Pause detection while the tab is hidden; the camera stays open.
  useEffect(() => {
    const onVis = () => { if (!document.hidden && loopRef.current.running) schedule(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  });

  const drawOverlay = (box, ok) => {
    const canvas = overlayRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    if (canvas.width !== video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!box) return;
    const c = ok ? '#3fd0e0' : '#f2bd4b';
    const L = Math.max(14, box.width * 0.16);
    ctx.strokeStyle = c;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const { x, y, width: w, height: h } = box;
    ctx.moveTo(x, y + L); ctx.lineTo(x, y); ctx.lineTo(x + L, y);
    ctx.moveTo(x + w - L, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + L);
    ctx.moveTo(x + w, y + h - L); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - L, y + h);
    ctx.moveTo(x + L, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - L);
    ctx.stroke();
  };

  const submit = async (descriptor) => {
    const signals = live.toSignals(trackerRef.current);
    stopLoop();
    setPhase('submitting');
    try {
      const { data } = await api.post('/verify', { descriptor: Array.from(descriptor), signals });
      if (data.decision === 'liveness_incomplete') {
        // Client and server gates disagree (shouldn't happen) — keep collecting.
        resetTracking();
        setPhase('scanning');
        startLoop();
        return;
      }
      setResult(data);
      setPhase('result');
      say(OUTCOME[data.decision]?.say);
      setSession((s) => [{ at: new Date(), decision: data.decision, name: data.user?.name }, ...s].slice(0, 8));
      if (data.decision === 'marked') refreshCount();
      holdTimerRef.current = setTimeout(nextPerson, RESULT_HOLD_MS);
    } catch (err) {
      setResult({ decision: 'error', message: errorMessage(err, 'The server could not process this scan.') });
      setPhase('result');
    }
  };

  const tick = async () => {
    const video = videoRef.current;
    if (!loopRef.current.running || !video) return;
    if (document.hidden || video.readyState < 2 || busyRef.current) return schedule();
    busyRef.current = true;
    try {
      const now = Date.now();
      if (now - lastBrightnessRef.current.at > 1000) {
        lastBrightnessRef.current = { at: now, value: measureBrightness(video, probeRef.current) };
      }
      const detections = await faceService.detectAllFaces(video);
      if (!loopRef.current.running) return;
      const face = detections.length === 1 ? detections[0] : null;
      const issue = live.qualityIssue({
        faceCount: detections.length,
        faceWidth: face?.detection.box.width,
        frameWidth: video.videoWidth,
        brightness: lastBrightnessRef.current.value,
      });
      setQuality(issue);
      drawOverlay(detections[0]?.detection.box, !issue);

      if (issue) {
        if (now - lastSeenRef.current > FACE_LOST_RESET_MS || issue.code === 'multiple_faces') resetTracking();
      } else {
        lastSeenRef.current = now;
        const lm = face.landmarks;
        trackerRef.current = live.step(trackerRef.current || live.createTracker(now), {
          leftEye: lm.getLeftEye(), rightEye: lm.getRightEye(), nose: lm.getNose()[3],
        });
        setProgress(live.progress(trackerRef.current));
        if (live.ready(trackerRef.current)) {
          busyRef.current = false;
          return submit(face.descriptor);
        }
      }
    } catch (err) {
      console.error('[verify] detection error', err);
    } finally {
      busyRef.current = false;
    }
    schedule();
  };

  function schedule() {
    clearTimeout(loopRef.current.timer);
    if (loopRef.current.running) loopRef.current.timer = setTimeout(tick, DETECT_INTERVAL_MS);
  }

  function startLoop() {
    loopRef.current.running = true;
    schedule();
  }

  function nextPerson() {
    clearTimeout(holdTimerRef.current);
    setResult(null);
    setPhoto(null);
    resetTracking();
    setQuality(SEARCHING);
    if (streamRef.current) {
      setPhase('scanning');
      startLoop();
    } else {
      setPhase('idle');
    }
  }

  const start = async () => {
    setFailure(null);
    setPhase('loading');
    try {
      await faceService.loadModels();
    } catch {
      setFailure({ kind: 'models', title: 'Face models failed to load', text: 'The model files in /models could not be downloaded. Check the network and that the files exist on the server.' });
      setPhase('error');
      return;
    }
    setPhase('camera');
    try {
      const stream = await openCamera();
      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();
    } catch (err) {
      const kind = classifyCameraError(err);
      setFailure({ kind, ...CAMERA_ERRORS[kind] });
      setPhase('error');
      return;
    }
    resetTracking();
    setQuality(SEARCHING);
    setPhase('scanning');
    startLoop();
  };

  const stop = () => {
    shutdown();
    setResult(null);
    setQuality(null);
    resetTracking();
    setPhase('idle');
  };

  const showPhoto = async () => {
    try {
      const { data } = await api.get(`/users/${result.user.id}/photo`);
      setPhoto(data.faceImage);
      clearTimeout(holdTimerRef.current); // keep the result up while the operator compares
    } catch (err) {
      setPhoto({ error: errorMessage(err) });
    }
  };

  const toggleVoice = () => {
    voiceService.setEnabled(!voice);
    setVoice(!voice);
  };

  // ---- Stage model (what the rail shows) ----
  const cameraOn = ['scanning', 'submitting', 'result'].includes(phase);
  const livenessDone = progress.frames >= 1 && progress.movement >= 1 && progress.blink >= 1;
  const server = result?.stages;
  const stageState = {
    camera: phase === 'error' && failure?.kind !== 'models' ? 'failed' : cameraOn ? 'passed' : ['loading', 'camera'].includes(phase) ? 'active' : 'pending',
    quality: phase === 'scanning' ? (quality ? 'active' : 'passed') : server ? (server.detection?.status === 'failed' ? 'failed' : 'passed') : phase === 'submitting' ? 'passed' : 'pending',
    liveness: server?.liveness ? server.liveness.status : phase === 'submitting' || livenessDone ? 'passed' : phase === 'scanning' && !quality ? 'active' : 'pending',
    match: server?.match?.status ?? (phase === 'submitting' ? 'active' : 'pending'),
    risk: server?.risk?.status ?? 'pending',
    decision: server?.decision?.status ?? 'pending',
  };
  const stageDetail = {
    camera: cameraOn ? 'Camera active. Video stays on this device.' : phase === 'loading' ? 'Loading face models…' : phase === 'camera' ? 'Waiting for camera permission…' : 'Camera is off',
    quality: phase === 'scanning' ? (quality?.text ?? 'One clear face in view') : server?.detection?.detail ?? 'Checks for one well-lit face',
    liveness: server?.liveness?.detail ?? 'Blink once and move your head slightly — measured in this browser',
    match: server?.match ? `${server.match.detail}${server.match.confidence != null ? ` · similarity ${server.match.confidence}%` : ''}` : phase === 'submitting' ? 'Comparing with enrolled profiles on the server…' : 'Done by the server, not this browser',
    risk: server?.risk ? `${server.risk.detail}${server.risk.learning ? ' · first scan, learning baseline' : ''}` : 'Rule-based signals; never proof of fraud',
    decision: server?.decision?.detail ?? 'Recorded only after every check above',
  };

  const outcome = result && (OUTCOME[result.decision] || { tone: 'danger', icon: XCircle, title: 'Scan not processed' });

  return (
    <>
      <PageHeader
        eyebrow="Verification kiosk"
        title="Verify attendance"
        description="One person at a time looks at the camera. The browser measures blink and head movement; the server matches the face and decides."
        actions={
          <>
            <button className="btn btn-ghost" onClick={toggleVoice} aria-pressed={voice}>
              {voice ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />} Spoken prompts {voice ? 'on' : 'off'}
            </button>
            {cameraOn
              ? <button className="btn btn-danger" onClick={stop}><CameraOff size={16} aria-hidden="true" /> Stop camera</button>
              : <button className="btn btn-primary" onClick={start} disabled={phase === 'loading' || phase === 'camera'}><Camera size={16} aria-hidden="true" /> Start camera</button>}
          </>
        }
      />

      <div className="verify-layout">
        <div className="stack">
          <div className="viewport">
            <video ref={videoRef} muted playsInline aria-label="Camera preview" />
            <canvas ref={overlayRef} aria-hidden="true" />
            <canvas ref={probeRef} hidden />
            {cameraOn && <div className="reticle" aria-hidden="true" />}

            {!cameraOn && (
              <div className="viewport-overlay">
                {phase === 'error' ? (
                  <div className="stack" style={{ alignItems: 'center', maxWidth: 420 }} role="alert">
                    <div className="empty-icon" style={{ color: 'var(--danger)' }}><CameraOff size={18} aria-hidden="true" /></div>
                    <strong>{failure?.title}</strong>
                    <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>{failure?.text}</p>
                    <button className="btn" onClick={start}><RefreshCw size={14} aria-hidden="true" /> Try again</button>
                  </div>
                ) : phase === 'loading' || phase === 'camera' ? (
                  <div className="stack" style={{ alignItems: 'center' }} role="status">
                    <div className="spinner" />
                    <span className="muted">{phase === 'loading' ? 'Loading face models (first time can take a few seconds)…' : 'Waiting for camera permission…'}</span>
                  </div>
                ) : (
                  <div className="stack" style={{ alignItems: 'center', maxWidth: 440 }}>
                    <div className="empty-icon"><ScanFace size={18} aria-hidden="true" /></div>
                    <strong>Before you start</strong>
                    <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>
                      The camera image is processed in this browser and is not uploaded or stored. Only a 128-number face descriptor and the
                      blink/movement measurements are sent to the FRAMS server to find a match.
                    </p>
                    <button className="btn btn-primary" onClick={start}><Camera size={16} aria-hidden="true" /> Start camera</button>
                  </div>
                )}
              </div>
            )}

            {phase === 'scanning' && (
              <div className="viewport-status" aria-live="polite">
                <span className="viewport-chip">
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: quality ? 'var(--warning)' : 'var(--accent)' }} aria-hidden="true" />
                  {quality ? quality.text : livenessDone ? 'Checking…' : 'Hold still, blink once, turn your head slightly'}
                </span>
              </div>
            )}
            {phase === 'submitting' && (
              <div className="viewport-status" role="status"><span className="viewport-chip"><span className="spinner" style={{ width: 12, height: 12 }} /> Verifying with server…</span></div>
            )}
          </div>

          {phase === 'result' && outcome && (
            <div className={`outcome outcome-${outcome.tone}`} role="status" aria-live="assertive">
              <outcome.icon size={28} aria-hidden="true" style={{ flex: 'none', color: `var(--${outcome.tone === 'neutral' ? 'neutral' : outcome.tone})` }} />
              <div className="stack" style={{ gap: 8, flex: 1, minWidth: 0 }}>
                <div>
                  <div className="outcome-title">{outcome.title}</div>
                  {result.user && <div className="secondary">{result.user.name} <span className="muted">· {result.user.role}</span></div>}
                  {result.record && <div className="muted" style={{ fontSize: 'var(--text-xs)' }}>{result.record.date} at {result.record.time}</div>}
                  {result.decision === 'error' && <div className="secondary">{result.message}</div>}
                  {result.decision === 'no_match' && <div className="secondary">Nothing was recorded. If this person is enrolled, improve the lighting or ask an administrator to re-enroll them.</div>}
                  {result.decision === 'pending_review' && <div className="secondary">Nothing negative has been concluded. A faculty member will confirm or reject this record.</div>}
                </div>
                {result.stages?.risk?.reasons?.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--text-xs)' }} className="secondary">
                    {result.stages.risk.reasons.map((r) => <li key={r}>{SIGNAL_TEXT[r] || r}</li>)}
                  </ul>
                )}
                {photo && (photo.error
                  ? <span className="field-error">{photo.error}</span>
                  : <img src={photo} alt={`Enrollment photo of ${result.user?.name}`} style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border-strong)' }} />)}
                <div className="row">
                  <button className="btn btn-primary btn-sm" onClick={nextPerson}>Next person</button>
                  {result.user && !photo && <button className="btn btn-sm" onClick={showPhoto}><ImageIcon size={14} aria-hidden="true" /> Compare with enrollment photo</button>}
                  {result.decision === 'pending_review' && <Link className="btn btn-sm btn-ghost" to="/review">Open review queue</Link>}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="stack">
          <Card title="Verification stages" sub="Stages 4–6 are decided by the server">
            <ol className="stages" style={{ padding: '4px 20px 8px' }}>
              {STAGES.map(([key, title], i) => {
                const status = stageState[key];
                return (
                  <li key={key} className="stage" data-status={status}>
                    <span className="stage-dot"><StageIcon status={status} index={i} /></span>
                    <div>
                      <div className="stage-title">{title} <span className="sr-only">— {STATUS_WORD[status]}</span></div>
                      <div className="stage-detail">{stageDetail[key]}</div>
                      {key === 'liveness' && phase === 'scanning' && (
                        <div className="stack" style={{ gap: 4, marginTop: 6 }}>
                          {[['blink', 'Blink'], ['movement', 'Head movement'], ['frames', 'Stable frames']].map(([k, label]) => (
                            <div key={k}>
                              <div className="row-between" style={{ fontSize: 11 }}><span className="muted">{label}</span><span className="mono muted">{Math.round(progress[k] * 100)}%</span></div>
                              <div className="meter" data-done={progress[k] >= 1}><span style={{ width: `${progress[k] * 100}%` }} /></div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>

          <Card title="Today" sub="From the server">
            <div className="card-body row-between">
              <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>Marked present</span>
              <span className="stat-value" style={{ fontSize: 'var(--text-2xl)' }}>{todayCount ?? '—'}</span>
            </div>
          </Card>

          <Card title="This session" sub="Outcomes on this device since the page opened">
            {session.length === 0 ? (
              <p className="card-body muted" style={{ fontSize: 'var(--text-sm)' }}>No scans yet.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: '8px 20px 12px' }}>
                {session.map((s, i) => (
                  <li key={i} className="row-between" style={{ padding: '6px 0', fontSize: 'var(--text-sm)' }}>
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name || 'Unidentified'}</span>
                    <span className="row" style={{ gap: 8 }}>
                      {s.decision === 'marked' ? <StatusPill value="present" /> : s.decision === 'pending_review' ? <StatusPill value="pending_review" /> : s.decision === 'already_marked' ? <Pill>Already</Pill> : <Pill tone="danger">Not recorded</Pill>}
                      <span className="mono muted" style={{ fontSize: 11 }}>{s.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Notice tone="info">
            Liveness checks are measured in this browser and can be fooled by a video replay. Treat them as evidence, not proof.
          </Notice>
        </div>
      </div>
    </>
  );
}
