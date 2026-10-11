const express = require('express');
const router = express.Router();
const { loginUser, getProfile } = require('../controllers/authController');
const { createUser } = require('../controllers/userController');
const { protect, admin } = require('../middleware/authMiddleware');
const rateLimit = require('../lib/rateLimit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.LOGIN_RATE_LIMIT || 10),
  key: (req) => `${req.ip}|${String(req.body?.email || '').toLowerCase()}`,
  message: 'Too many sign-in attempts. Wait 15 minutes and try again.',
});

router.post('/login', loginLimiter, loginUser);
// Was public and accepted any role, including admin. Now an alias of POST /api/users.
router.post('/register', protect, admin, createUser);
router.get('/profile', protect, getProfile);

module.exports = router;
