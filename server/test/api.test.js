const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

let api;
test.before(async () => { api = await h.setup(); });
test.after(h.teardown);
test.beforeEach(h.reset);

// ---------- Authentication ----------

test('login: correct credentials succeed and never return the password', async () => {
  const { user } = await h.makeUser('faculty');
  const res = await api.post('/api/auth/login').send({ email: user.email, password: 'correct-horse-battery' });
  assert.equal(res.status, 200);
  assert.ok(res.body.token);
  assert.equal(res.body.user.role, 'faculty');
  assert.equal(JSON.stringify(res.body).includes('password'), false);
});

test('login: the "<role>@123" master key no longer works for any account', async () => {
  const { user } = await h.makeUser('admin');
  const res = await api.post('/api/auth/login').send({ email: user.email, password: 'admin@123', role: 'admin' });
  assert.equal(res.status, 401);
});

test('login: an unknown email does not fall back to another user of the same role', async () => {
  await h.makeUser('admin');
  const res = await api.post('/api/auth/login').send({ email: 'nobody@test.invalid', password: 'correct-horse-battery', role: 'admin' });
  assert.equal(res.status, 401);
});

test('register: anonymous callers cannot create accounts', async () => {
  const res = await api.post('/api/auth/register').send({ name: 'X', email: 'x@test.invalid', password: 'whatever123', role: 'admin' });
  assert.equal(res.status, 401);
});

test('protect: token for a deleted user is rejected cleanly', async () => {
  const { user, token } = await h.makeUser('faculty');
  await h.User.deleteOne({ _id: user._id });
  const res = await api.get('/api/auth/profile').set(h.auth(token));
  assert.equal(res.status, 401);
});

test('protect: a forged token is rejected', async () => {
  const res = await api.get('/api/auth/profile').set(h.auth('eyJhbGciOiJIUzI1NiJ9.e30.invalid'));
  assert.equal(res.status, 401);
});

// ---------- Users & biometric data exposure ----------

test('users: list never contains descriptors, images or passwords', async () => {
  const { token } = await h.makeUser('faculty');
  await h.makeUser('student', { faceDescriptor: h.syntheticDescriptor(1), faceImage: 'data:image/jpeg;base64,AAAA', faceEnrolledAt: new Date() });
  const res = await api.get('/api/users').set(h.auth(token));
  assert.equal(res.status, 200);
  const body = JSON.stringify(res.body);
  assert.equal(body.includes('faceDescriptor'), false);
  assert.equal(body.includes('faceImage'), false);
  assert.equal(body.includes('password'), false);
  assert.equal(res.body.find((u) => u.role === 'student').faceEnrolled, true);
});

test('users: legacy users without faceEnrolledAt are still reported as enrolled', async () => {
  const { token } = await h.makeUser('admin');
  await h.makeUser('student', { faceDescriptor: h.syntheticDescriptor(2) });
  const res = await api.get('/api/users').set(h.auth(token));
  assert.equal(res.body.find((u) => u.role === 'student').faceEnrolled, true);
});

test('users: students cannot list users', async () => {
  const { token } = await h.makeUser('student');
  const res = await api.get('/api/users').set(h.auth(token));
  assert.equal(res.status, 403);
});

test('users: faculty cannot create users; admin can, with a generated temporary password', async () => {
  const { token: facultyToken } = await h.makeUser('faculty');
  const denied = await api.post('/api/users').set(h.auth(facultyToken)).send({ name: 'New Student' });
  assert.equal(denied.status, 403);

  const { token } = await h.makeUser('admin');
  const res = await api.post('/api/users').set(h.auth(token)).send({ name: 'New Student', department: 'Physics' });
  assert.equal(res.status, 201);
  assert.ok(res.body.temporaryPassword && res.body.temporaryPassword !== 'student@123');
  const login = await api.post('/api/auth/login').send({ email: res.body.email, password: res.body.temporaryPassword });
  assert.equal(login.status, 200);
});

test('users: malformed face descriptors are rejected', async () => {
  const { token } = await h.makeUser('admin');
  const res = await api.post('/api/users').set(h.auth(token)).send({ name: 'Bad Face', faceDescriptor: [1, 2, 3] });
  assert.equal(res.status, 400);
});

test('users: behavior endpoint is gone (was unauthenticated)', async () => {
  const { user } = await h.makeUser('student');
  const res = await api.put(`/api/users/${user._id}/update-behavior`).send({ adaptiveThreshold: 0 });
  assert.equal(res.status, 410);
});

test('users: bulk delete requires admin and an explicit confirmation phrase', async () => {
  const { token: facultyToken } = await h.makeUser('faculty');
  assert.equal((await api.delete('/api/users/bulk/clear').set(h.auth(facultyToken))).status, 403);
  const { token } = await h.makeUser('admin');
  assert.equal((await api.delete('/api/users/bulk/clear').set(h.auth(token))).status, 400);
  const ok = await api.delete('/api/users/bulk/clear').set(h.auth(token)).send({ confirm: 'DELETE ALL USERS' });
  assert.equal(ok.status, 200);
});

// ---------- Attendance integrity ----------

test('attendance: legacy unauthenticated /mark endpoint cannot create records', async () => {
  const { user } = await h.makeUser('student');
  const res = await api.post('/api/attendance/mark').send({ userId: user._id, name: user.name, confidenceScore: 99, riskLevel: 'LOW' });
  assert.equal(res.status, 410);
  const anon = await api.post('/api/attendance').send({ userId: user._id, name: user.name, confidenceScore: 99 });
  assert.equal(anon.status, 401);
  assert.equal(await h.Attendance.countDocuments(), 0);
});

test('attendance: manual marking takes identity from the database and ignores client claims', async () => {
  const { token } = await h.makeUser('faculty');
  const { user } = await h.makeUser('student');
  const res = await api.post('/api/attendance').set(h.auth(token))
    .send({ userId: user._id, name: 'Somebody Else', role: 'admin', confidenceScore: 100, riskLevel: 'LOW' });
  assert.equal(res.status, 201);
  assert.equal(res.body.name, user.name);
  assert.equal(res.body.role, 'student');
  assert.equal(res.body.method, 'manual');
  assert.equal(res.body.confidenceScore, null);
  const dup = await api.post('/api/attendance').set(h.auth(token)).send({ userId: user._id });
  assert.equal(dup.status, 409);
});

test('attendance: students can read only their own history', async () => {
  const a = await h.makeUser('student');
  const b = await h.makeUser('student');
  assert.equal((await api.get(`/api/attendance/student/${a.user._id}`).set(h.auth(a.token))).status, 200);
  assert.equal((await api.get(`/api/attendance/student/${b.user._id}`).set(h.auth(a.token))).status, 403);
  assert.equal((await api.get('/api/attendance').set(h.auth(a.token))).status, 403);
});

test('attendance: faculty can no longer wipe all records; admin needs confirmation', async () => {
  const { token: facultyToken } = await h.makeUser('faculty');
  assert.equal((await api.delete('/api/attendance/clear').set(h.auth(facultyToken))).status, 403);
  const { token } = await h.makeUser('admin');
  assert.equal((await api.delete('/api/attendance/clear').set(h.auth(token))).status, 400);
  assert.equal((await api.delete('/api/attendance/clear').set(h.auth(token)).send({ confirm: 'CLEAR ALL ATTENDANCE' })).status, 200);
});

// ---------- Verification ----------

const enroll = (seed) => h.makeUser('student', { faceDescriptor: h.syntheticDescriptor(seed), faceEnrolledAt: new Date() });

test('verify: requires a staff session', async () => {
  const { token } = await h.makeUser('student');
  const body = { descriptor: h.syntheticDescriptor(1), signals: h.goodSignals };
  assert.equal((await api.post('/api/verify').send(body)).status, 401);
  assert.equal((await api.post('/api/verify').set(h.auth(token)).send(body)).status, 403);
});

test('verify: accepted match is marked present once, with stages and server-side date', async () => {
  const { token } = await h.makeUser('faculty');
  const { user } = await enroll(3);
  const body = { descriptor: h.syntheticDescriptor(3, 0.2), signals: h.goodSignals };

  const res = await api.post('/api/verify').set(h.auth(token)).send(body);
  assert.equal(res.status, 201);
  assert.equal(res.body.decision, 'marked');
  assert.equal(res.body.user.name, user.name);
  assert.equal(res.body.stages.match.status, 'passed');
  assert.equal(res.body.stages.liveness.source, 'client');
  assert.equal(res.body.record.date, new Date().toISOString().slice(0, 10)); // FRAMS_TIMEZONE=UTC in tests
  assert.equal(JSON.stringify(res.body).includes('faceDescriptor'), false);

  const again = await api.post('/api/verify').set(h.auth(token)).send(body);
  assert.equal(again.body.decision, 'already_marked');
  assert.equal(await h.Attendance.countDocuments({ userId: user._id }), 1);

  const updated = await h.User.findById(user._id);
  assert.equal(updated.behaviorProfile.avgScanTime, h.goodSignals.scanTimeMs);
});

test('verify: concurrent submissions still produce exactly one record', async () => {
  const { token } = await h.makeUser('faculty');
  const { user } = await enroll(4);
  const body = { descriptor: h.syntheticDescriptor(4), signals: h.goodSignals };
  const results = await Promise.all([1, 2, 3, 4].map(() => api.post('/api/verify').set(h.auth(token)).send(body)));
  assert.equal(results.filter((r) => r.body.decision === 'marked').length, 1);
  assert.equal(results.filter((r) => r.body.decision === 'already_marked').length, 3);
  assert.equal(await h.Attendance.countDocuments({ userId: user._id }), 1);
});

test('verify: uncertain match goes to review instead of being marked present', async () => {
  const { token } = await h.makeUser('faculty');
  await enroll(5);
  const res = await api.post('/api/verify').set(h.auth(token)).send({ descriptor: h.syntheticDescriptor(5, 0.55), signals: h.goodSignals });
  assert.equal(res.body.decision, 'pending_review');
  const record = await h.Attendance.findById(res.body.record.id);
  assert.equal(record.status, 'pending_review');
  assert.deepEqual([...record.reviewReasons], ['uncertain_match']);
});

test('verify: no match creates nothing', async () => {
  const { token } = await h.makeUser('faculty');
  await enroll(6);
  const res = await api.post('/api/verify').set(h.auth(token)).send({ descriptor: h.syntheticDescriptor(6, 0.9), signals: h.goodSignals });
  assert.equal(res.body.decision, 'no_match');
  assert.equal(await h.Attendance.countDocuments(), 0);
});

test('verify: incomplete liveness and multiple faces are rejected before matching', async () => {
  const { token } = await h.makeUser('faculty');
  await enroll(7);
  const d = h.syntheticDescriptor(7);
  const noBlink = await api.post('/api/verify').set(h.auth(token)).send({ descriptor: d, signals: { ...h.goodSignals, blinkCount: 0 } });
  assert.equal(noBlink.body.decision, 'liveness_incomplete');
  const many = await api.post('/api/verify').set(h.auth(token)).send({ descriptor: d, signals: { ...h.goodSignals, faceCount: 2 } });
  assert.equal(many.body.decision, 'multiple_faces');
  assert.equal(await h.Attendance.countDocuments(), 0);
});

test('verify: malformed descriptor or signals return 400', async () => {
  const { token } = await h.makeUser('faculty');
  assert.equal((await api.post('/api/verify').set(h.auth(token)).send({ descriptor: [1], signals: h.goodSignals })).status, 400);
  assert.equal((await api.post('/api/verify').set(h.auth(token)).send({ descriptor: h.syntheticDescriptor(1), signals: { frames: -1 } })).status, 400);
});

test('verify: behavior deviation is sent to review, not silently dropped', async () => {
  const { token } = await h.makeUser('faculty');
  const { user } = await enroll(8);
  await h.User.updateOne({ _id: user._id }, { behaviorProfile: { blinkRate: 0.9, movementPattern: 100, stabilityScore: 1, avgScanTime: 9000, adaptiveThreshold: 0.75 } });
  const res = await api.post('/api/verify').set(h.auth(token)).send({ descriptor: h.syntheticDescriptor(8), signals: h.goodSignals });
  assert.equal(res.body.decision, 'pending_review');
  assert.ok(res.body.stages.risk.reasons.includes('behavior_deviation'));
  const after = await h.User.findById(user._id);
  assert.equal(after.behaviorProfile.avgScanTime, 9000, 'profile is not learned from an unreviewed scan');
});

// ---------- Review & corrections ----------

test('review: faculty confirm moves record to present and is audited', async () => {
  const { token } = await h.makeUser('faculty');
  await enroll(9);
  const v = await api.post('/api/verify').set(h.auth(token)).send({ descriptor: h.syntheticDescriptor(9, 0.55), signals: h.goodSignals });
  const queue = await api.get('/api/attendance/review-queue').set(h.auth(token));
  assert.equal(queue.body.length, 1);

  const noNote = await api.patch(`/api/attendance/${v.body.record.id}/review`).set(h.auth(token)).send({ decision: 'reject' });
  assert.equal(noNote.status, 400);

  const ok = await api.patch(`/api/attendance/${v.body.record.id}/review`).set(h.auth(token)).send({ decision: 'confirm' });
  assert.equal(ok.body.status, 'present');
  assert.equal(ok.body.reviewStatus, 'confirmed');

  const { token: adminToken } = await h.makeUser('admin');
  const log = await api.get('/api/audit?action=attendance.review_confirmed').set(h.auth(adminToken));
  assert.equal(log.body.length, 1);
});

test('corrections: student requests, sees only own, faculty approves and a record is created', async () => {
  const s = await h.makeUser('student');
  const other = await h.makeUser('student');
  const f = await h.makeUser('faculty');
  const date = '2026-01-15';

  const bad = await api.post('/api/corrections').set(h.auth(s.token)).send({ date, reason: 'short' });
  assert.equal(bad.status, 400);
  const created = await api.post('/api/corrections').set(h.auth(s.token)).send({ date, reason: 'The camera was offline during the morning lecture.' });
  assert.equal(created.status, 201);
  const dupe = await api.post('/api/corrections').set(h.auth(s.token)).send({ date, reason: 'The camera was offline during the morning lecture.' });
  assert.equal(dupe.status, 400);

  assert.equal((await api.get('/api/corrections').set(h.auth(other.token))).body.length, 0);
  assert.equal((await api.patch(`/api/corrections/${created.body._id}`).set(h.auth(s.token)).send({ decision: 'approve' })).status, 403);

  const approved = await api.patch(`/api/corrections/${created.body._id}`).set(h.auth(f.token)).send({ decision: 'approve' });
  assert.equal(approved.body.status, 'approved');
  const rec = await h.Attendance.findOne({ userId: s.user._id, date });
  assert.equal(rec.method, 'correction');
  assert.equal(rec.status, 'present');
});

test('audit log is admin-only', async () => {
  const { token } = await h.makeUser('faculty');
  assert.equal((await api.get('/api/audit').set(h.auth(token))).status, 403);
});

test('health reports demo mode and database state without secrets', async () => {
  const res = await api.get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.database, 'connected');
  assert.equal(typeof res.body.demoMode, 'boolean');
  assert.equal(JSON.stringify(res.body).includes('mongodb'), false);
});
