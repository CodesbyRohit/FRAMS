const test = require('node:test');
const assert = require('node:assert/strict');
const bio = require('../lib/biometrics');

test('classifyMatch keeps the original thresholds', () => {
  assert.equal(bio.classifyMatch(0.3), 'accepted');
  assert.equal(bio.classifyMatch(0.5), 'accepted'); // original server accepted confidence >= 50
  assert.equal(bio.classifyMatch(0.5001), 'uncertain');
  assert.equal(bio.classifyMatch(0.6), 'uncertain');
  assert.equal(bio.classifyMatch(0.6001), 'none');
  assert.equal(bio.classifyMatch(undefined), 'none');
});

test('evaluateLiveness requires frames >= 3, movement > 4 and a blink', () => {
  assert.equal(bio.evaluateLiveness({ frames: 3, movementScore: 4.01, blinkCount: 1 }).passed, true);
  assert.equal(bio.evaluateLiveness({ frames: 2, movementScore: 10, blinkCount: 1 }).passed, false);
  assert.equal(bio.evaluateLiveness({ frames: 5, movementScore: 4, blinkCount: 1 }).passed, false);
  assert.equal(bio.evaluateLiveness({ frames: 5, movementScore: 10, blinkCount: 0 }).passed, false);
});

test('assessRisk boundaries match the original client rules', () => {
  const base = { similarity: 1, adaptiveThreshold: 0.75, scanTimeMs: 1000, movementScore: 10, avgScanTime: 2000 };
  assert.deepEqual(bio.assessRisk(base), { score: 0, level: 'LOW', reasons: [] });
  // slow scan only: 20 → LOW
  assert.equal(bio.assessRisk({ ...base, scanTimeMs: 3001 }).level, 'LOW');
  // slow + low motion: 40 → MEDIUM
  assert.equal(bio.assessRisk({ ...base, scanTimeMs: 3001, movementScore: 0.4 }).level, 'MEDIUM');
  // behavior deviation alone: 50 → MEDIUM
  assert.equal(bio.assessRisk({ ...base, similarity: 0.54 }).level, 'MEDIUM');
  // deviation + slow: 70 → HIGH, all reasons reported
  const high = bio.assessRisk({ ...base, similarity: 0.54, scanTimeMs: 3001 });
  assert.equal(high.level, 'HIGH');
  assert.deepEqual(high.reasons, ['behavior_deviation', 'slow_scan']);
  // exactly at the deviation edge does not fire
  assert.equal(bio.assessRisk({ ...base, similarity: 0.55 }).score, 0);
});

test('behaviorSimilarity is 1.0 in learning mode and penalises drift', () => {
  const s = { frames: 10, blinkCount: 1, movementScore: 10, scanTimeMs: 2000 };
  assert.equal(bio.behaviorSimilarity(s, {}), 1);
  const stored = { blinkRate: 0.1, movementPattern: 10, avgScanTime: 2000 };
  assert.equal(bio.behaviorSimilarity(s, stored), 1);
  assert.ok(bio.behaviorSimilarity({ ...s, movementScore: 60, scanTimeMs: 7000 }, stored) < 0.5);
});

test('nextBehaviorProfile uses the original moving averages', () => {
  const s = { frames: 10, blinkCount: 2, movementScore: 20, scanTimeMs: 3000 };
  const first = bio.nextBehaviorProfile({}, s, 1);
  assert.equal(first.avgScanTime, 3000);
  assert.equal(first.blinkRate, 0.2);
  assert.ok(Math.abs(first.adaptiveThreshold - (0.75 * 0.9 + 0.1)) < 1e-9);
  const second = bio.nextBehaviorProfile({ ...first, avgScanTime: 2000 }, s, 0.8);
  assert.equal(second.avgScanTime, 2000 * 0.8 + 3000 * 0.2);
});

test('isValidDescriptor rejects malformed input', () => {
  assert.equal(bio.isValidDescriptor(new Array(128).fill(0.1)), true);
  assert.equal(bio.isValidDescriptor(new Array(127).fill(0.1)), false);
  assert.equal(bio.isValidDescriptor([...new Array(127).fill(0.1), NaN]), false);
  assert.equal(bio.isValidDescriptor([...new Array(127).fill(0.1), '0.1']), false);
  assert.equal(bio.isValidDescriptor('nope'), false);
});
