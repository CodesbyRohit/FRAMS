const Attendance = require('../models/Attendance');
const User = require('../models/User');
const audit = require('../lib/audit');
const { badRequest, forbidden, notFound, assertObjectId, isIsoDate, localDate, localTime, isDuplicateKey } = require('../lib/http');

const STATUSES = ['present', 'unknown', 'pending_review', 'rejected'];
const REVIEW_STATUSES = ['none', 'pending', 'confirmed', 'rejected'];

const isStaff = (user) => user.role === 'admin' || user.role === 'faculty';

// GET /api/attendance — staff. Optional filters: from, to (YYYY-MM-DD), status, reviewStatus, userId.
// Faculty currently see all records: the data model has no classes or course
// assignments to scope them by (see audit §6).
const getAttendance = async (req, res) => {
  const { from, to, status, reviewStatus, userId } = req.query;
  const filter = {};
  if (from || to) {
    if ((from && !isIsoDate(from)) || (to && !isIsoDate(to))) throw badRequest('Dates must be YYYY-MM-DD');
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }
  if (status) {
    if (!STATUSES.includes(status)) throw badRequest('Unknown status');
    filter.status = status;
  }
  if (reviewStatus) {
    if (!REVIEW_STATUSES.includes(reviewStatus)) throw badRequest('Unknown review status');
    filter.reviewStatus = reviewStatus;
  }
  if (userId) {
    assertObjectId(userId, 'userId');
    filter.userId = userId;
  }
  const attendance = await Attendance.find(filter).sort({ createdAt: -1 }).limit(5000);
  res.json(attendance);
};

const getMyAttendance = async (req, res) => {
  const attendance = await Attendance.find({ userId: req.user._id }).sort({ createdAt: -1 });
  res.json(attendance);
};

// GET /api/attendance/student/:id — the student themself, or staff.
const getStudentAttendance = async (req, res) => {
  assertObjectId(req.params.id);
  if (!isStaff(req.user) && String(req.user._id) !== String(req.params.id)) {
    throw forbidden('You can only view your own attendance');
  }
  const attendance = await Attendance.find({ userId: req.params.id }).sort({ createdAt: -1 });
  res.json(attendance);
};

// POST /api/attendance — manual marking by staff. Identity fields come from the
// database, not the request; confidence/risk fields in the body are ignored.
const markManual = async (req, res) => {
  const { userId, date, note } = req.body || {};
  assertObjectId(userId, 'userId');
  const day = date ?? localDate();
  if (!isIsoDate(day)) throw badRequest('Date must be YYYY-MM-DD');
  if (day > localDate()) throw badRequest('Attendance cannot be recorded for a future date');

  const user = await User.findById(userId);
  if (!user) throw notFound('User not found');

  try {
    const record = await Attendance.create({
      userId: user._id,
      name: user.name,
      role: user.role,
      date: day,
      time: localTime(),
      method: 'manual',
      status: 'present',
      reviewNote: typeof note === 'string' ? note.slice(0, 500) : undefined,
      recordedBy: req.user._id,
    });
    await audit(req, 'attendance.manual_marked', { targetType: 'attendance', targetId: record._id, details: { userId: String(user._id), date: day } });
    res.status(201).json(record);
  } catch (err) {
    if (isDuplicateKey(err)) return res.status(409).json({ message: `${user.name} already has a record for ${day}` });
    throw err;
  }
};

// The original unauthenticated, client-trusted endpoint.
const markLegacy = (req, res) => {
  res.status(410).json({ message: 'Removed. Face attendance is recorded by POST /api/verify.' });
};

const getReviewQueue = async (req, res) => {
  const records = await Attendance.find({ reviewStatus: 'pending' }).sort({ createdAt: -1 }).limit(500);
  res.json(records);
};

// PATCH /api/attendance/:id/review { decision: 'confirm' | 'reject', note }
const reviewRecord = async (req, res) => {
  assertObjectId(req.params.id);
  const { decision, note } = req.body || {};
  if (!['confirm', 'reject'].includes(decision)) throw badRequest('Decision must be "confirm" or "reject"');
  if (decision === 'reject' && (typeof note !== 'string' || note.trim().length < 3)) {
    throw badRequest('Add a short note explaining the rejection');
  }

  const record = await Attendance.findById(req.params.id);
  if (!record) throw notFound('Record not found');
  if (record.reviewStatus !== 'pending') throw badRequest('This record is not awaiting review');

  const before = { status: record.status, reviewStatus: record.reviewStatus };
  record.status = decision === 'confirm' ? 'present' : 'rejected';
  record.reviewStatus = decision === 'confirm' ? 'confirmed' : 'rejected';
  record.reviewedBy = req.user._id;
  record.reviewedAt = new Date();
  record.reviewNote = typeof note === 'string' ? note.trim().slice(0, 500) : undefined;
  await record.save();

  await audit(req, `attendance.review_${record.reviewStatus}`, {
    targetType: 'attendance',
    targetId: record._id,
    details: { before, after: { status: record.status, reviewStatus: record.reviewStatus }, reviewReasons: record.reviewReasons },
  });
  res.json(record);
};

const CLEAR_CONFIRMATION = 'CLEAR ALL ATTENDANCE';

// Admin only (previously any faculty member could wipe every record).
const clearAllAttendance = async (req, res) => {
  if (req.body?.confirm !== CLEAR_CONFIRMATION) throw badRequest(`Type "${CLEAR_CONFIRMATION}" to confirm`);
  const result = await Attendance.deleteMany({});
  await audit(req, 'attendance.cleared', { details: { deleted: result.deletedCount } });
  res.json({ message: `Deleted ${result.deletedCount} attendance records.` });
};

module.exports = {
  getAttendance, getMyAttendance, getStudentAttendance, markManual, markLegacy,
  getReviewQueue, reviewRecord, clearAllAttendance, CLEAR_CONFIRMATION,
};
