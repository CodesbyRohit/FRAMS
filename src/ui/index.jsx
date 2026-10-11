import { useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, CircleSlash, Clock, Info, RefreshCw, XCircle } from 'lucide-react';
import { CORRECTION, REVIEW, RISK, STATUS } from '../lib/format';

export function BrandMark({ className = 'brand-mark' }) {
  // Aperture with a calibration tick: an instrument, not a face.
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="7" stroke="var(--border-strong)" />
      <path d="M9 12V9h3M20 9h3v3M23 20v3h-3M12 23H9v-3" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="16" cy="16" r="3.2" stroke="var(--text)" strokeWidth="1.6" />
    </svg>
  );
}

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-desc">{description}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}

export function Card({ title, sub, actions, children, pad = false, className = '', ...rest }) {
  return (
    <section className={`card ${className}`} {...rest}>
      {(title || actions) && (
        <div className="card-header">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {sub && <p className="card-sub">{sub}</p>}
          </div>
          {actions}
        </div>
      )}
      {pad ? <div className="card-body">{children}</div> : children}
    </section>
  );
}

export function Stat({ label, value, foot, icon: Icon, loading }) {
  return (
    <div className="card stat">
      <div className="stat-label">{Icon && <Icon size={14} aria-hidden="true" />}{label}</div>
      {loading ? <div className="skeleton" style={{ height: 36, width: 64, marginTop: 6 }} /> : <div className="stat-value">{value}</div>}
      {foot && <div className="stat-foot">{foot}</div>}
    </div>
  );
}

const TONE_ICON = { success: CheckCircle2, warning: Clock, danger: XCircle, neutral: CircleDashed, accent: Info };

export function Pill({ tone = 'neutral', icon, children }) {
  const Icon = icon === undefined ? TONE_ICON[tone] : icon;
  return (
    <span className={`pill pill-${tone}`}>
      {Icon && <Icon size={12} aria-hidden="true" />}
      {children}
    </span>
  );
}

const MAPS = { status: STATUS, review: REVIEW, risk: RISK, correction: CORRECTION };

// Status is never conveyed by colour alone: every pill carries an icon and a word.
export function StatusPill({ kind = 'status', value }) {
  const meta = MAPS[kind]?.[value];
  if (!meta) return <Pill tone="neutral">{value || '—'}</Pill>;
  const icon = kind === 'risk' ? (value === 'LOW' ? CheckCircle2 : AlertTriangle) : undefined;
  return <Pill tone={meta.tone} icon={icon}>{kind === 'risk' ? `${meta.label} risk` : meta.label}</Pill>;
}

export function Notice({ tone = 'info', title, children }) {
  const Icon = tone === 'danger' ? XCircle : tone === 'warning' ? AlertTriangle : Info;
  return (
    <div className={`notice notice-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon size={16} aria-hidden="true" />
      <div>{title && <strong>{title} </strong>}{children}</div>
    </div>
  );
}

export function EmptyState({ icon: Icon = CircleSlash, title, description, action }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon size={18} aria-hidden="true" /></div>
      <p className="empty-title">{title}</p>
      {description && <p className="empty-desc">{description}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export function Loading({ label = 'Loading' }) {
  return (
    <div className="empty" role="status" aria-live="polite">
      <div className="spinner" />
      <p className="empty-desc">{label}…</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="empty" role="alert">
      <div className="empty-icon" style={{ color: 'var(--danger)' }}><XCircle size={18} aria-hidden="true" /></div>
      <p className="empty-title">Couldn’t load this</p>
      <p className="empty-desc">{message}</p>
      {onRetry && (
        <button className="btn btn-sm" onClick={onRetry} style={{ marginTop: 8 }}>
          <RefreshCw size={14} aria-hidden="true" /> Try again
        </button>
      )}
    </div>
  );
}

export function Field({ label, htmlFor, hint, error, children }) {
  return (
    <div className="field">
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <span className="field-error" id={`${htmlFor}-error`}>{error}</span> : hint && <span className="hint">{hint}</span>}
    </div>
  );
}

// Native <dialog>: focus trapping, Escape and inert background come from the browser.
export function Dialog({ open, onClose, title, description, children, footer }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose(); }} aria-labelledby="dialog-title">
      {open && (
        <>
          <div className="dialog-header">
            <h2 className="dialog-title" id="dialog-title">{title}</h2>
            {description && <p className="page-desc">{description}</p>}
          </div>
          <div className="dialog-body">{children}</div>
          {footer && <div className="dialog-footer">{footer}</div>}
        </>
      )}
    </dialog>
  );
}
