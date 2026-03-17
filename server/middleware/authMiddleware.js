const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
      console.log(`[AUTH] User: ${req.user.email}, Role: ${req.user.role}`);
      next();
    } catch (error) {
      console.error(error);
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

const admin = (req, res, next) => {
  if (req.user && req.user.role.toLowerCase().trim() === 'admin') {
    next();
  } else {
    res.status(403).json({ 
      success: false, 
      message: 'Not authorized as an admin',
      detectedRole: req.user?.role
    });
  }
};

const faculty = (req, res, next) => {
  const role = req.user?.role?.toLowerCase().trim();
  if (req.user && (role === 'faculty' || role === 'admin')) {
    next();
  } else {
    res.status(403).json({ 
      success: false, 
      message: 'Not authorized as faculty',
      detectedRole: role
    });
  }
};

module.exports = { protect, admin, faculty };
