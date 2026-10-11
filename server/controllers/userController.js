const crypto = require('crypto');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const audit = require('../lib/audit');
const { isValidDescriptor } = require('../lib/biometrics');
const { badRequest, notFound, assertObjectId } = require('../lib/http');

const ROLES = ['admin', 'faculty', 'student'];
const MAX_FACE_IMAGE_CHARS = 1_500_000; // ~1.1 MB JPEG as base64
const FACE_IMAGE_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

const summary = (u) => ({
  _id: u._id,
  name: u.name,
  username: u.username,
  email: u.email,
  role: u.role,
  department: u.department,
  researchPapers: u.researchPapers,
  faceEnrolled: Boolean(u.faceEnrolledAt),
  faceEnrolledAt: u.faceEnrolledAt,
  riskProfile: u.riskProfile,
  createdAt: u.createdAt,
});

// Never returns face descriptors or images. The original endpoint returned every
// user's descriptor and photo to any faculty session.
const getUsers = async (req, res) => {
  const users = await User.find({}).sort({ createdAt: -1 });
  // Users enrolled before faceEnrolledAt existed: derive the flag from the data.
  const legacyEnrolled = new Set(
    (await User.find({ faceEnrolledAt: { $exists: false }, faceDescriptor: { $exists: true, $ne: [] } }, '_id'))
      .map((u) => String(u._id))
  );
  res.json(users.map((u) => ({ ...summary(u), faceEnrolled: Boolean(u.faceEnrolledAt) || legacyEnrolled.has(String(u._id)) })));
};

const getUserById = async (req, res) => {
  assertObjectId(req.params.id);
  const user = await User.findById(req.params.id);
  if (!user) throw notFound('User not found');
  res.json(summary(user));
};

// Enrollment photo, for staff confirming an identity. Audited.
const getUserPhoto = async (req, res) => {
  assertObjectId(req.params.id);
  const user = await User.findById(req.params.id).select('+faceImage name');
  if (!user || !user.faceImage) throw notFound('No enrollment photo on file');
  await audit(req, 'biometric.photo_viewed', { targetType: 'user', targetId: user._id });
  res.set('Cache-Control', 'no-store');
  res.json({ faceImage: user.faceImage });
};

const createUser = async (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const role = body.role ? String(body.role).toLowerCase() : 'student';
  let email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  let password = typeof body.password === 'string' ? body.password : '';
  const { faceDescriptor, faceImage, department } = body;

  if (!name || name.length > 120) throw badRequest('Name is required (max 120 characters)');
  if (!ROLES.includes(role)) throw badRequest('Role must be admin, faculty or student');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('Email address is not valid');
  if (password && password.length < 8) throw badRequest('Password must be at least 8 characters');
  if (faceDescriptor != null && !isValidDescriptor(faceDescriptor)) {
    throw badRequest('Face data is malformed. Capture the face again.');
  }
  if (faceImage != null && (typeof faceImage !== 'string' || faceImage.length > MAX_FACE_IMAGE_CHARS || !FACE_IMAGE_RE.test(faceImage))) {
    throw badRequest('Enrollment photo must be a JPEG, PNG or WebP image under 1 MB');
  }
  const researchPapers = body.researchPapers === '' || body.researchPapers == null ? 0 : Number(body.researchPapers);
  if (!Number.isInteger(researchPapers) || researchPapers < 0) throw badRequest('Research papers must be a whole number');

  if (!email) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'user';
    email = `${slug}.${crypto.randomInt(1000, 9999)}@frams.edu`;
  }

  // The previous default was "<role>@123" for every account. Generate a one-time
  // password instead and return it once so the administrator can hand it over.
  let temporaryPassword;
  if (!password) {
    temporaryPassword = crypto.randomBytes(9).toString('base64url');
    password = temporaryPassword;
  }

  if (await User.exists({ email })) throw badRequest(`A user with email ${email} already exists`);

  const username = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '')}_${crypto.randomBytes(3).toString('hex')}`;
  const hasFace = Array.isArray(faceDescriptor);

  const user = await User.create({
    name,
    username,
    email,
    role,
    password,
    department: typeof department === 'string' ? department.trim().slice(0, 120) : undefined,
    researchPapers,
    faceDescriptor: hasFace ? faceDescriptor : undefined,
    faceImage: hasFace ? faceImage : undefined,
    faceEnrolledAt: hasFace ? new Date() : undefined,
  });

  await audit(req, 'user.created', {
    targetType: 'user',
    targetId: user._id,
    details: { role, faceEnrolled: hasFace },
  });

  res.status(201).json({ ...summary(user), ...(temporaryPassword ? { temporaryPassword } : {}) });
};

const deleteUser = async (req, res) => {
  assertObjectId(req.params.id);
  if (String(req.params.id) === String(req.user._id)) throw badRequest('You cannot delete your own account');
  const user = await User.findById(req.params.id);
  if (!user) throw notFound('User not found');
  await User.deleteOne({ _id: user._id });
  await audit(req, 'user.deleted', { targetType: 'user', targetId: user._id, details: { role: user.role } });
  res.json({ message: 'User and their biometric data removed. Attendance history is retained.' });
};

const BULK_CONFIRMATION = 'DELETE ALL USERS';

const deleteAllUsers = async (req, res) => {
  if (req.body?.confirm !== BULK_CONFIRMATION) {
    throw badRequest(`Type "${BULK_CONFIRMATION}" to confirm`);
  }
  const result = await User.deleteMany({ _id: { $ne: req.user._id } });
  const attendance = await Attendance.deleteMany({});
  await audit(req, 'system.reset', {
    details: { usersDeleted: result.deletedCount, attendanceDeleted: attendance.deletedCount },
  });
  res.json({
    message: 'System reset complete. All other users and all attendance records were deleted.',
    deletedCount: result.deletedCount,
  });
};

// Behavior profiles are now updated by the server inside POST /api/verify.
// This endpoint was unauthenticated and accepted any adaptiveThreshold.
const updateBehavior = (req, res) => {
  res.status(410).json({ message: 'Removed. Behavior profiles are updated by POST /api/verify.' });
};

module.exports = { getUsers, getUserById, getUserPhoto, createUser, deleteUser, deleteAllUsers, updateBehavior, BULK_CONFIRMATION };
