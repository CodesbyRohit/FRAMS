const jwt = require('jsonwebtoken');
const User = require('../models/User');
const audit = require('../lib/audit');

const generateToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '12h' });

const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  username: user.username || user.name,
  email: user.email,
  role: user.role,
  department: user.department,
  faceEnrolled: Boolean(user.faceEnrolledAt),
});

// Email + password only. The previous implementation also accepted "<role>@123"
// for any account and fell back to an arbitrary user of the requested role.
const loginUser = async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const user = await User.findOne({ email });
  if (!user || !(await user.matchPassword(password))) {
    await audit(req, 'auth.login_failed', { targetType: 'email', targetId: email });
    return res.status(401).json({ message: 'Incorrect email or password' });
  }

  await audit(req, 'auth.login', { actor: user, targetType: 'user', targetId: user._id });
  res.json({ token: generateToken(user._id, user.role), user: publicUser(user) });
};

const getProfile = async (req, res) => {
  res.json(publicUser(req.user));
};

module.exports = { loginUser, getProfile, generateToken, publicUser };
