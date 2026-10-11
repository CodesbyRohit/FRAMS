// Browser-side liveness signal collection. These are the same measurements the
// original scanner made (eye-aspect-ratio blink detection and cumulative nose
// movement). They are *signals*, sent to the server as client-reported evidence;
// a replayed video can produce them.

export const EAR_CLOSED = 0.28; // original threshold
export const MOVE_MIN_PX = 0.2;
export const MOVE_MAX_PX = 50;
// Mirrors the server gates in server/lib/biometrics.js (the server re-checks).
export const GATES = { frames: 3, movement: 4, blinks: 1 };
// Face must fill at least this fraction of the frame width to be usable.
export const MIN_FACE_WIDTH_RATIO = 0.12;
export const MIN_BRIGHTNESS = 45; // mean luma, 0–255

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const eyeAspectRatio = (eye) => {
  const h = dist(eye[0], eye[3]);
  if (!h) return 1;
  return (dist(eye[1], eye[5]) + dist(eye[2], eye[4])) / (2 * h);
};

export const createTracker = (now = Date.now()) => ({
  startedAt: now,
  frames: 0,
  blinkCount: 0,
  eyesClosed: false,
  movementScore: 0,
  lastNose: null,
});

// Advance the tracker with one frame's landmarks. Returns a new object.
export const step = (t, { leftEye, rightEye, nose }) => {
  const next = { ...t, frames: t.frames + 1 };
  const ear = (eyeAspectRatio(leftEye) + eyeAspectRatio(rightEye)) / 2;
  if (!t.eyesClosed && ear < EAR_CLOSED) next.eyesClosed = true;
  else if (t.eyesClosed && ear >= EAR_CLOSED) {
    next.eyesClosed = false;
    next.blinkCount = t.blinkCount + 1;
  }
  if (t.lastNose) {
    const d = dist(nose, t.lastNose);
    if (d > MOVE_MIN_PX && d < MOVE_MAX_PX) next.movementScore = t.movementScore + d;
  }
  next.lastNose = nose;
  return next;
};

export const progress = (t) => ({
  frames: Math.min(1, t.frames / GATES.frames),
  movement: Math.min(1, t.movementScore / GATES.movement),
  blink: Math.min(1, t.blinkCount / GATES.blinks),
});

export const ready = (t) =>
  t.frames >= GATES.frames && t.movementScore > GATES.movement && t.blinkCount >= GATES.blinks;

export const toSignals = (t, now = Date.now()) => ({
  frames: t.frames,
  blinkCount: t.blinkCount,
  movementScore: Number(t.movementScore.toFixed(3)),
  scanTimeMs: Math.max(0, now - t.startedAt),
  faceCount: 1,
});

// Frame quality from detections; returns the first blocking issue or null.
export const qualityIssue = ({ faceCount, faceWidth, frameWidth, brightness }) => {
  if (faceCount === 0) return { code: 'no_face', text: 'No face in view — step in front of the camera' };
  if (faceCount > 1) return { code: 'multiple_faces', text: `${faceCount} faces in view — one person at a time` };
  if (brightness != null && brightness < MIN_BRIGHTNESS) return { code: 'dark', text: 'Too dark — add light in front of the face' };
  if (frameWidth && faceWidth / frameWidth < MIN_FACE_WIDTH_RATIO) return { code: 'far', text: 'Face is too small — move closer' };
  return null;
};
