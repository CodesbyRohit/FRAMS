const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { verify } = require('../controllers/verifyController');
const corrections = require('../controllers/correctionController');
const AuditEvent = require('../models/AuditEvent');
const { protect, admin, faculty } = require('../middleware/authMiddleware');
const rateLimit = require('../lib/rateLimit');

const verifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.VERIFY_RATE_LIMIT || 60),
  key: (req) => String(req.user._id),
  message: 'Too many verification attempts from this session. Slow down.',
});

// Public, and intentionally reveals nothing sensitive.
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    demoMode: process.env.FRAMS_SEED_DEMO === 'true',
    time: new Date().toISOString(),
  });
});

router.post('/verify', protect, faculty, verifyLimiter, verify);

router.route('/corrections')
  .get(protect, corrections.listCorrections)
  .post(protect, corrections.createCorrection);
router.patch('/corrections/:id', protect, faculty, corrections.resolveCorrection);

router.get('/audit', protect, admin, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const filter = typeof req.query.action === 'string' && req.query.action ? { action: req.query.action } : {};
  res.json(await AuditEvent.find(filter).sort({ createdAt: -1 }).limit(limit));
});

module.exports = router;
