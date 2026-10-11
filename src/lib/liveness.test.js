import test from 'node:test';
import assert from 'node:assert/strict';
import { createTracker, step, ready, toSignals, qualityIssue, eyeAspectRatio } from './liveness.js';

// Synthetic eye: 6 points with a given vertical opening.
const eye = (open) => [
  { x: 0, y: 0 }, { x: 1, y: -open }, { x: 2, y: -open }, { x: 3, y: 0 }, { x: 2, y: open }, { x: 1, y: open },
];
const frame = (open, noseX) => ({ leftEye: eye(open), rightEye: eye(open), nose: { x: noseX, y: 0 } });

test('eyeAspectRatio of open and closed eyes', () => {
  assert.ok(eyeAspectRatio(eye(0.6)) > 0.28);
  assert.ok(eyeAspectRatio(eye(0.2)) < 0.28);
});

test('a blink is counted on close then reopen', () => {
  let t = createTracker(0);
  t = step(t, frame(0.6, 0));
  t = step(t, frame(0.2, 0));
  assert.equal(t.blinkCount, 0);
  t = step(t, frame(0.6, 0));
  assert.equal(t.blinkCount, 1);
});

test('movement ignores jitter below 0.2px and jumps of 50px or more', () => {
  let t = createTracker(0);
  t = step(t, frame(0.6, 0));
  t = step(t, frame(0.6, 0.1));
  assert.equal(t.movementScore, 0);
  t = step(t, frame(0.6, 80));
  assert.equal(t.movementScore, 0);
  t = step(t, frame(0.6, 83));
  assert.equal(t.movementScore, 3);
});

test('ready only when frames, movement and blink gates all pass', () => {
  let t = createTracker(0);
  [0, 2, 4].forEach((x) => { t = step(t, frame(0.6, x)); });
  assert.equal(ready(t), false); // movement 4 is not > 4, no blink
  t = step(t, frame(0.2, 6));
  t = step(t, frame(0.6, 8));
  assert.equal(ready(t), true);
  assert.deepEqual(toSignals(t, 2500), { frames: 5, blinkCount: 1, movementScore: 8, scanTimeMs: 2500, faceCount: 1 });
});

test('quality issues are reported in priority order', () => {
  assert.equal(qualityIssue({ faceCount: 0 }).code, 'no_face');
  assert.equal(qualityIssue({ faceCount: 2, brightness: 10 }).code, 'multiple_faces');
  assert.equal(qualityIssue({ faceCount: 1, brightness: 10, faceWidth: 10, frameWidth: 1000 }).code, 'dark');
  assert.equal(qualityIssue({ faceCount: 1, brightness: 120, faceWidth: 50, frameWidth: 1000 }).code, 'far');
  assert.equal(qualityIssue({ faceCount: 1, brightness: 120, faceWidth: 300, frameWidth: 1000 }), null);
});
