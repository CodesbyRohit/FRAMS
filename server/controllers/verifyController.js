const User = require('../models/User');
const Attendance = require('../models/Attendance');
const audit = require('../lib/audit');
const bio = require('../lib/biometrics');
const { badRequest, localDate, localTime, isDuplicateKey } = require('../lib/http');

const num = (v, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

const parseSignals = (raw = {}) => {
  const s = {
    frames: raw.frames,
    blinkCount: raw.blinkCount,
    movementScore: raw.movementScore,
    scanTimeMs: raw.scanTimeMs,
    faceCount: raw.faceCount ?? 1,
  };
  if (!num(s.frames, { max: 100000 }) || !num(s.blinkCount, { max: 10000 }) || !num(s.movementScore, { max: 1e6 }) ||
      !num(s.scanTimeMs, { max: 10 * 60 * 1000 }) || !num(s.faceCount, { max: 100 })) {
    throw badRequest('Liveness signals are missing or out of range');
  }
  return s;
};

// Every stage reports what was observed; nothing here is a guarantee that a live
// person was present. Liveness signals are measured in the browser and are only
// as trustworthy as the kiosk they come from.
const stage = (status, detail, extra = {}) => ({ status, detail, ...extra });

// POST /api/verify — called by a signed-in faculty/admin kiosk.
const verify = async (req, res) => {
  const { descriptor, signals: rawSignals } = req.body || {};
  if (!bio.isValidDescriptor(descriptor)) throw badRequest('Face descriptor must be 128 finite numbers');
  const signals = parseSignals(rawSignals);

  const stages = {
    detection: stage('passed', 'One face detected in frame'),
    liveness: null,
    match: null,
    risk: null,
    decision: null,
  };

  if (signals.faceCount !== 1) {
    stages.detection = stage('failed', `${signals.faceCount} faces in frame — verification needs exactly one`);
    stages.decision = stage('failed', 'Ask one person at a time to step up to the camera');
    return res.json({ decision: 'multiple_faces', stages });
  }

  const live = bio.evaluateLiveness(signals);
  stages.liveness = stage(live.passed ? 'passed' : 'failed',
    live.passed ? 'Blink and head movement observed (browser-measured)' : 'Not enough blink or movement observed yet',
    { checks: live.checks, source: 'client' });
  if (!live.passed) {
    stages.decision = stage('failed', 'Keep looking at the camera, blink naturally and move your head slightly');
    return res.json({ decision: 'liveness_incomplete', stages });
  }

  const candidates = await User.find(
    { faceDescriptor: { $exists: true, $ne: [] } },
    { name: 1, role: 1, behaviorProfile: 1, riskProfile: 1 }
  ).select('+faceDescriptor');

  const { best, second } = bio.findBestMatch(descriptor, candidates.map((u) => ({ id: String(u._id), descriptor: u.faceDescriptor })));
  const matchClass = bio.classifyMatch(best?.distance);

  if (matchClass === 'none') {
    stages.match = stage('failed', candidates.length ? 'Face does not match any enrolled profile' : 'No faces are enrolled yet');
    stages.decision = stage('failed', 'Not recorded. If this person is enrolled, try better lighting or re-enroll them.');
    await audit(req, 'verify.no_match', { details: { enrolledProfiles: candidates.length } });
    return res.json({ decision: 'no_match', stages });
  }

  const user = candidates.find((u) => String(u._id) === best.id);
  const confidence = bio.confidenceFromDistance(best.distance);
  const ambiguous = Boolean(second && second.distance <= bio.MATCH_ACCEPT_MAX_DISTANCE &&
    second.distance - best.distance < bio.AMBIGUITY_MARGIN);

  stages.match = stage(matchClass === 'accepted' ? 'passed' : 'uncertain',
    matchClass === 'accepted' ? 'Matched an enrolled profile' : 'Possible match, below the automatic-acceptance threshold',
    { confidence, ambiguous });

  const stored = user.behaviorProfile || {};
  const adaptiveThreshold = stored.adaptiveThreshold || bio.DEFAULT_ADAPTIVE_THRESHOLD;
  const similarity = bio.behaviorSimilarity(signals, stored);
  const risk = bio.assessRisk({
    similarity,
    adaptiveThreshold,
    scanTimeMs: signals.scanTimeMs,
    movementScore: signals.movementScore,
    avgScanTime: user.riskProfile?.avgScanTime,
  });
  const behaviorOk = similarity >= adaptiveThreshold;
  stages.risk = stage(risk.level === 'LOW' ? 'passed' : 'flagged',
    risk.level === 'LOW' ? 'No unusual signals' : 'Unusual signals — flagged for human review, not treated as proof of fraud',
    { level: risk.level, reasons: risk.reasons, learning: !stored.avgScanTime });

  // Decision policy. Previously: only an accepted match with passing behavior was
  // stored; everything else silently failed. Uncertain outcomes now go to a human.
  const reviewReasons = [];
  if (matchClass === 'uncertain') reviewReasons.push('uncertain_match');
  if (ambiguous) reviewReasons.push('ambiguous_match');
  if (!behaviorOk) reviewReasons.push('behavior_deviation');
  if (risk.level === 'HIGH') reviewReasons.push('high_risk');

  const pending = matchClass === 'uncertain' || !behaviorOk;
  const now = new Date();

  let record;
  try {
    record = await Attendance.create({
      userId: user._id,
      name: user.name,
      role: user.role,
      date: localDate(now),
      time: localTime(now),
      confidenceScore: confidence,
      matchDistance: Number(best.distance.toFixed(4)),
      status: pending ? 'pending_review' : 'present',
      method: 'face',
      liveness: { frames: signals.frames, blinkCount: signals.blinkCount, movementScore: signals.movementScore, scanTimeMs: signals.scanTimeMs, source: 'client' },
      behaviorSimilarity: Number(similarity.toFixed(4)),
      riskLevel: risk.level,
      riskScore: risk.score,
      riskReasons: risk.reasons,
      riskReason: risk.reasons.join(', ') || 'Normal behavior',
      reviewStatus: reviewReasons.length ? 'pending' : 'none',
      reviewReasons,
      recordedBy: req.user._id,
    });
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
    const existing = await Attendance.findOne({ userId: user._id, date: localDate(now) });
    stages.decision = stage('info', `Already recorded today at ${existing?.time ?? 'an earlier time'}`);
    return res.json({
      decision: 'already_marked',
      stages,
      user: { id: user._id, name: user.name, role: user.role },
      record: existing && { id: existing._id, date: existing.date, time: existing.time, status: existing.status },
    });
  }

  if (!pending) {
    user.behaviorProfile = bio.nextBehaviorProfile(stored, signals, similarity);
    if (!user.riskProfile) user.riskProfile = {};
    user.riskProfile.avgScanTime = (user.riskProfile.avgScanTime ?? bio.DEFAULT_AVG_SCAN_MS) * 0.9 + signals.scanTimeMs * 0.1;
    if (risk.level === 'HIGH') user.riskProfile.anomalyCount = (user.riskProfile.anomalyCount || 0) + 1;
    await user.save();
  }

  stages.decision = pending
    ? stage('uncertain', 'Recorded as pending — a faculty member will review it')
    : stage('passed', reviewReasons.length ? 'Marked present, and flagged for review' : 'Marked present');

  await audit(req, 'verify.recorded', {
    targetType: 'attendance',
    targetId: record._id,
    details: { status: record.status, riskLevel: risk.level, reviewReasons },
  });

  res.status(201).json({
    decision: pending ? 'pending_review' : 'marked',
    stages,
    user: { id: user._id, name: user.name, role: user.role },
    record: { id: record._id, date: record.date, time: record.time, status: record.status, reviewStatus: record.reviewStatus },
  });
};

module.exports = { verify };
