// Server-side verification rules.
//
// Every constant here is carried over unchanged from the original client-side
// implementation (src/pages/Scanner.jsx and server/controllers/attendanceController.js
// at commit 8cc8ec2) so that moving the decision to the server does not silently
// change who gets marked present. Deliberate changes are listed in
// docs/FRAMS_2_0_AUDIT.md §8.

const DESCRIPTOR_LENGTH = 128;

// Euclidean distance between 128-D face-api.js descriptors.
// Original: distance < 0.50 → HIGH trust, <= 0.60 → MEDIUM, otherwise no match
// (FaceMatcher threshold 0.6). The original server additionally rejected any
// confidence below 50% (i.e. distance > 0.50), so only HIGH matches were ever stored.
const MATCH_ACCEPT_MAX_DISTANCE = 0.5;
const MATCH_CANDIDATE_MAX_DISTANCE = 0.6;
// New (review flag only, never blocks): two enrolled people both closer than
// the accept threshold and within this margin of each other.
const AMBIGUITY_MARGIN = 0.05;

// Liveness gates (original: frames >= 3, movementScore > 4, at least one blink).
const LIVENESS_MIN_FRAMES = 3;
const LIVENESS_MIN_MOVEMENT = 4;
const LIVENESS_MIN_BLINKS = 1;

const DEFAULT_ADAPTIVE_THRESHOLD = 0.75;
const DEFAULT_AVG_SCAN_MS = 2000;

const euclidean = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
};

const isValidDescriptor = (d) =>
  Array.isArray(d) &&
  d.length === DESCRIPTOR_LENGTH &&
  d.every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 10);

// candidates: [{ id, descriptor }]. Returns best and runner-up by distance.
const findBestMatch = (probe, candidates) => {
  let best = null;
  let second = null;
  for (const c of candidates) {
    if (!isValidDescriptor(c.descriptor)) continue;
    const distance = euclidean(probe, c.descriptor);
    if (!best || distance < best.distance) {
      second = best;
      best = { id: c.id, distance };
    } else if (!second || distance < second.distance) {
      second = { id: c.id, distance };
    }
  }
  return { best, second };
};

const classifyMatch = (distance) => {
  if (distance == null) return 'none';
  if (distance <= MATCH_ACCEPT_MAX_DISTANCE) return 'accepted';
  if (distance <= MATCH_CANDIDATE_MAX_DISTANCE) return 'uncertain';
  return 'none';
};

const confidenceFromDistance = (distance) =>
  Math.max(0, Math.min(100, Math.round((1 - distance) * 100)));

const evaluateLiveness = ({ frames = 0, movementScore = 0, blinkCount = 0 } = {}) => {
  const checks = {
    frames: frames >= LIVENESS_MIN_FRAMES,
    movement: movementScore > LIVENESS_MIN_MOVEMENT,
    blink: blinkCount >= LIVENESS_MIN_BLINKS,
  };
  return { passed: checks.frames && checks.movement && checks.blink, checks };
};

// Original "behavior similarity". A user with no history (avgScanTime === 0) is in
// learning mode and scores 1.0.
const behaviorSimilarity = (signals, stored = {}) => {
  if (!stored.avgScanTime) return 1.0;
  const score = (live, ref, tol) => Math.max(0, 1 - Math.abs(live - ref) / tol);
  const liveBlinkRate = signals.frames > 0 ? signals.blinkCount / signals.frames : 0;
  const b = score(liveBlinkRate, stored.blinkRate || 0, 0.5);
  const m = score(signals.movementScore, stored.movementPattern || 0, 50.0);
  const t = score(signals.scanTimeMs, stored.avgScanTime, 5000);
  return b * 0.4 + m * 0.4 + t * 0.2;
};

// Original calculateRiskFrontend(), unchanged boundaries. The original kept only the
// last matching reason; all matching reasons are returned here.
const assessRisk = ({ similarity, adaptiveThreshold, scanTimeMs, movementScore, avgScanTime }) => {
  let score = 0;
  const reasons = [];
  if (similarity < adaptiveThreshold - 0.2) {
    score += 50;
    reasons.push('behavior_deviation');
  }
  if (scanTimeMs > (avgScanTime || DEFAULT_AVG_SCAN_MS) * 1.5) {
    score += 20;
    reasons.push('slow_scan');
  }
  if (movementScore < 0.5) {
    score += 20;
    reasons.push('low_motion');
  }
  const level = score >= 60 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW';
  return { score, level, reasons };
};

// Moving-average profile updates applied after a successful verification
// (original: behavior 0.8/0.2 with first-sample takeover, threshold 0.9/0.1,
// risk avgScanTime 0.9/0.1).
const nextBehaviorProfile = (stored = {}, signals, similarity) => {
  const first = !stored.avgScanTime;
  const blend = (old, now) => (first ? now : old * 0.8 + now * 0.2);
  const blinkRate = signals.frames > 0 ? signals.blinkCount / signals.frames : 0;
  const current = stored.adaptiveThreshold || DEFAULT_ADAPTIVE_THRESHOLD;
  return {
    blinkRate: blend(stored.blinkRate || 0, blinkRate),
    movementPattern: blend(stored.movementPattern || 0, signals.movementScore),
    stabilityScore: blend(stored.stabilityScore || 0, 1.0),
    avgScanTime: blend(stored.avgScanTime || 0, signals.scanTimeMs),
    adaptiveThreshold: current * 0.9 + similarity * 0.1,
  };
};

module.exports = {
  DESCRIPTOR_LENGTH,
  MATCH_ACCEPT_MAX_DISTANCE,
  MATCH_CANDIDATE_MAX_DISTANCE,
  AMBIGUITY_MARGIN,
  DEFAULT_ADAPTIVE_THRESHOLD,
  DEFAULT_AVG_SCAN_MS,
  euclidean,
  isValidDescriptor,
  findBestMatch,
  classifyMatch,
  confidenceFromDistance,
  evaluateLiveness,
  behaviorSimilarity,
  assessRisk,
  nextBehaviorProfile,
};
