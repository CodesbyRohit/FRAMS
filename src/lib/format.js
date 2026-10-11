// Display vocabulary. One place decides how a status, risk level or review reason
// is named, so every screen says the same thing.

export const STATUS = {
  present: { tone: 'success', label: 'Present' },
  pending_review: { tone: 'warning', label: 'Pending review' },
  rejected: { tone: 'danger', label: 'Rejected' },
  unknown: { tone: 'neutral', label: 'Unknown' },
};

export const REVIEW = {
  none: { tone: 'neutral', label: 'No review needed' },
  pending: { tone: 'warning', label: 'Awaiting review' },
  confirmed: { tone: 'success', label: 'Confirmed by reviewer' },
  rejected: { tone: 'danger', label: 'Rejected by reviewer' },
};

export const RISK = {
  LOW: { tone: 'success', label: 'Low' },
  MEDIUM: { tone: 'warning', label: 'Medium' },
  HIGH: { tone: 'danger', label: 'High' },
};

export const CORRECTION = {
  pending: { tone: 'warning', label: 'Pending' },
  approved: { tone: 'success', label: 'Approved' },
  denied: { tone: 'danger', label: 'Denied' },
};

export const METHOD = { face: 'Face verification', manual: 'Manual entry', correction: 'Approved correction' };

// Plain-language explanations for model signals. These describe what a signal
// means, not what it proves.
export const SIGNAL_TEXT = {
  uncertain_match: 'Face similarity was below the automatic-acceptance threshold.',
  ambiguous_match: 'Two enrolled profiles were similarly close to this face.',
  behavior_deviation: 'Scan behaviour (blink rate, head movement, duration) differed from this person’s history.',
  high_risk: 'Combined signals reached the HIGH risk band.',
  slow_scan: 'The scan took much longer than this person’s average.',
  low_motion: 'Very little head movement was observed.',
};

export const titleCase = (s = '') => s.charAt(0).toUpperCase() + s.slice(1);

// Client-local calendar date as YYYY-MM-DD (for filters and display only;
// the server decides which day a scan belongs to).
export const isoDate = (d = new Date()) => {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};

export const daysBack = (n, from = new Date()) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(from);
    d.setDate(d.getDate() - (n - 1 - i));
    return isoDate(d);
  });

export const formatDay = (iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
};

export const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';

export const errorMessage = (err, fallback = 'Something went wrong') =>
  err?.response?.data?.message || (err?.code === 'ERR_NETWORK' ? 'Cannot reach the FRAMS server. Check that it is running.' : err?.message) || fallback;
