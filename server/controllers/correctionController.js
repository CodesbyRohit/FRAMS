const CorrectionRequest = require('../models/CorrectionRequest');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const audit = require('../lib/audit');
const { badRequest, notFound, assertObjectId, isIsoDate, localDate, localTime } = require('../lib/http');

const isStaff = (user) => user.role === 'admin' || user.role === 'faculty';

// POST /api/corrections — a user asks for a missing or disputed day to be corrected.
const createCorrection = async (req, res) => {
  const { date, reason } = req.body || {};
  if (!isIsoDate(date)) throw badRequest('Date must be YYYY-MM-DD');
  if (date > localDate()) throw badRequest('You cannot request a correction for a future date');
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text.length < 10 || text.length > 1000) throw badRequest('Explain what happened in 10–1000 characters');

  const existing = await Attendance.findOne({ userId: req.user._id, date });
  if (existing && existing.status === 'present') throw badRequest(`You are already marked present on ${date}`);
  if (await CorrectionRequest.exists({ userId: req.user._id, date, status: 'pending' })) {
    throw badRequest(`You already have a pending request for ${date}`);
  }

  const request = await CorrectionRequest.create({ userId: req.user._id, userName: req.user.name, date, reason: text });
  await audit(req, 'correction.requested', { targetType: 'correction', targetId: request._id, details: { date } });
  res.status(201).json(request);
};

// GET /api/corrections — staff see all (optionally ?status=pending); others see their own.
const listCorrections = async (req, res) => {
  const filter = isStaff(req.user) ? {} : { userId: req.user._id };
  if (req.query.status) {
    if (!['pending', 'approved', 'denied'].includes(req.query.status)) throw badRequest('Unknown status');
    filter.status = req.query.status;
  }
  res.json(await CorrectionRequest.find(filter).sort({ createdAt: -1 }).limit(1000));
};

// PATCH /api/corrections/:id { decision: 'approve' | 'deny', note } — staff.
const resolveCorrection = async (req, res) => {
  assertObjectId(req.params.id);
  const { decision, note } = req.body || {};
  if (!['approve', 'deny'].includes(decision)) throw badRequest('Decision must be "approve" or "deny"');
  const noteText = typeof note === 'string' ? note.trim() : '';
  if (decision === 'deny' && noteText.length < 3) throw badRequest('Add a short note explaining the decision');

  const request = await CorrectionRequest.findById(req.params.id);
  if (!request) throw notFound('Request not found');
  if (request.status !== 'pending') throw badRequest('This request has already been resolved');

  request.status = decision === 'approve' ? 'approved' : 'denied';
  request.resolvedBy = req.user._id;
  request.resolvedByName = req.user.name;
  request.resolvedAt = new Date();
  request.resolutionNote = noteText.slice(0, 1000) || undefined;
  await request.save();

  let attendanceId;
  if (decision === 'approve') {
    const existing = await Attendance.findOne({ userId: request.userId, date: request.date });
    if (existing) {
      existing.status = 'present';
      if (existing.reviewStatus === 'pending') {
        existing.reviewStatus = 'confirmed';
        existing.reviewedBy = req.user._id;
        existing.reviewedAt = new Date();
      }
      await existing.save();
      attendanceId = existing._id;
    } else {
      const { role } = (await User.findById(request.userId, 'role')) || {};
      const created = await Attendance.create({
        userId: request.userId,
        name: request.userName,
        role: role || 'student',
        date: request.date,
        time: localTime(),
        method: 'correction',
        status: 'present',
        reviewNote: `Approved correction request ${request._id}`,
        recordedBy: req.user._id,
      });
      attendanceId = created._id;
    }
  }

  await audit(req, `correction.${request.status}`, {
    targetType: 'correction',
    targetId: request._id,
    details: { date: request.date, userId: String(request.userId), attendanceId: attendanceId && String(attendanceId) },
  });
  res.json(request);
};

module.exports = { createCorrection, listCorrections, resolveCorrection };
