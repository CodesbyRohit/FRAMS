import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { homePathFor, useAuth } from '../context/auth';
import { errorMessage } from '../lib/format';
import useHealth from '../lib/useHealth';
import { BrandMark, Field, Notice } from '../ui';

const PRINCIPLES = [
  ['Verification, not surveillance', 'A faculty-run kiosk checks one person at a time. Nothing is recorded until the server has compared the face with an enrolled profile.'],
  ['Every decision is explained', 'Each scan shows the stages it passed or failed: face, liveness signals, identity match, risk and the final decision.'],
  ['Uncertainty goes to a person', 'Weak matches and unusual signals are queued for faculty review. A risk flag is a prompt to look, never proof of wrongdoing.'],
  ['Honest limits', 'Blink and head-movement checks run in the browser and can be fooled by a video. They are evidence, not a guarantee of presence.'],
];

export default function Login() {
  const { login, isAuthenticated, user, notice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const health = useHealth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (isAuthenticated) return <Navigate to={homePathFor(user?.role)} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const u = await login(email.trim(), password);
      const from = location.state?.from?.pathname;
      navigate(from && from !== '/login' ? from : homePathFor(u.role), { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Sign-in failed'));
      setSubmitting(false);
    }
  };

  return (
    <div className="auth">
      <aside className="auth-aside">
        <div className="row"><BrandMark /><span className="brand-name">FRAMS</span></div>
        <div className="stack-lg">
          <div>
            <div className="eyebrow">Face-verified attendance</div>
            <h1 style={{ fontSize: 'var(--text-3xl)', maxWidth: '18ch', letterSpacing: '-0.02em' }}>
              Attendance you can explain, record by record.
            </h1>
          </div>
          <div className="principles">
            {PRINCIPLES.map(([title, body], i) => (
              <div className="principle" key={title}>
                <span className="principle-num">0{i + 1}</span>
                <div><strong style={{ color: 'var(--text)' }}>{title}.</strong> {body}</div>
              </div>
            ))}
          </div>
        </div>
        <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>
          Face matching runs on face-api.js (SSD MobileNet v1 detector, 128-D ResNet-34 embeddings). No accuracy figures are claimed for this deployment.
        </p>
      </aside>

      <main className="auth-main">
        <div className="auth-card stack-lg">
          <div className="row">
            <BrandMark />
            <div>
              <h1 style={{ fontSize: 'var(--text-xl)' }}>Sign in</h1>
              <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>Use the account your administrator gave you.</p>
            </div>
          </div>

          {notice && <Notice tone="warning">{notice}</Notice>}
          {health.state === 'down' && <Notice tone="danger" title="Server unreachable.">Sign-in will fail until the FRAMS API is running.</Notice>}
          {health.demoMode && (
            <Notice tone="warning" title="Demo environment.">
              Demo accounts: <span className="mono">admin@frams.edu</span>, <span className="mono">faculty@frams.edu</span>, <span className="mono">student@frams.edu</span> with passwords <span className="mono">admin@123</span> / <span className="mono">faculty@123</span> / <span className="mono">student@123</span>.
            </Notice>
          )}

          <form className="stack" onSubmit={submit} noValidate>
            <Field label="Email" htmlFor="email">
              <input id="email" className="input" type="email" autoComplete="username" required value={email}
                onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(error)} autoFocus />
            </Field>
            <Field label="Password" htmlFor="password">
              <div style={{ position: 'relative' }}>
                <input id="password" className="input" type={show ? 'text' : 'password'} autoComplete="current-password" required
                  value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(error)} style={{ paddingRight: 40 }} />
                <button type="button" className="btn btn-ghost icon-btn" onClick={() => setShow((s) => !s)}
                  aria-label={show ? 'Hide password' : 'Show password'} style={{ position: 'absolute', right: 1, top: 1, height: 36 }}>
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
            {error && <Notice tone="danger">{error}</Notice>}
            <button className="btn btn-primary btn-lg btn-block" disabled={submitting || !email || !password}>
              {submitting ? <span className="spinner" aria-hidden="true" /> : <LogIn size={16} aria-hidden="true" />}
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <p className="muted" style={{ fontSize: 'var(--text-xs)' }}>
            Forgotten your password? Ask an administrator. Accounts are created by administrators only.
          </p>
        </div>
      </main>
    </div>
  );
}
