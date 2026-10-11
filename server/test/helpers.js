// Test harness: in-memory MongoDB and synthetic users only. No real faces,
// descriptors or attendance data are used anywhere in the test suite.
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');

process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
process.env.FRAMS_TIMEZONE = 'UTC';
process.env.LOGIN_RATE_LIMIT = '1000';

const { createApp } = require('../app');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const { generateToken } = require('../controllers/authController');

let mongo;

const setup = async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Attendance.syncIndexes();
  return request(createApp());
};

const teardown = async () => {
  await mongoose.disconnect();
  await mongo.stop();
};

const reset = async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
};

// Deterministic synthetic 128-D vector; `seed` picks a direction, `jitter`
// moves it by a controlled Euclidean distance.
const syntheticDescriptor = (seed, jitter = 0) => {
  const v = Array.from({ length: 128 }, (_, i) => Math.sin((i + 1) * (seed + 1)) * 0.1);
  if (jitter) v[0] += jitter;
  return v;
};

let n = 0;
const makeUser = async (role, extra = {}) => {
  n += 1;
  const user = await User.create({
    name: `Synthetic ${role} ${n}`,
    username: `synthetic_${role}_${n}`,
    email: `synthetic.${role}.${n}@test.invalid`,
    password: 'correct-horse-battery',
    role,
    ...extra,
  });
  return { user, token: generateToken(user._id, user.role) };
};

const auth = (token) => ({ Authorization: `Bearer ${token}` });

const goodSignals = { frames: 10, blinkCount: 2, movementScore: 12, scanTimeMs: 2500, faceCount: 1 };

module.exports = { setup, teardown, reset, syntheticDescriptor, makeUser, auth, goodSignals, User, Attendance };
