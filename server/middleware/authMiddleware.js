const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  let decoded;
  try {
    decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Session expired or invalid. Please sign in again.' });
  }

  const user = await User.findById(decoded.id);
  if (!user) {
    return res.status(401).json({ message: 'Account no longer exists' });
  }
  req.user = user;
  next();
};

const requireRole = (...roles) => (req, res, next) => {
  if (req.user && roles.includes(req.user.role)) return next();
  return res.status(403).json({ message: 'You do not have permission to do that' });
};

const admin = requireRole('admin');
// "faculty" has always meant faculty or admin in this codebase.
const faculty = requireRole('faculty', 'admin');

module.exports = { protect, requireRole, admin, faculty };
