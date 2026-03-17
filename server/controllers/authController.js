const jwt = require('jsonwebtoken');
const User = require('../models/User');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

const loginUser = async (req, res) => {
  const { email, password, role } = req.body;
  console.log(`[LOGIN ATTEMPT] Email: ${email}, Role: ${role}`);

  const user = await User.findOne({ email });

  if (!user) {
    console.log(`[LOGIN FAILED] No user found with email: ${email}`);
  } else {
    const isMatch = await user.matchPassword(password);
    const roleMatch = user.role === role;
    
    console.log(`[LOGIN INFO] User Found: ${user.email}, Role: ${user.role}`);
    console.log(`[LOGIN INFO] Password Match: ${isMatch}, Role Match: ${roleMatch}`);
  }

  if (user && (await user.matchPassword(password)) && user.role.toLowerCase().trim() === role.toLowerCase().trim()) {
    console.log(`[LOGIN SUCCESS] User: ${user.email}`);
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user._id)
    });
  } else {
    console.log(`[LOGIN FAILED] Reason: ${!user ? 'User not found' : 'Role/Password mismatch'}`);
    res.status(401).json({ message: 'Invalid email, password, or role' });
  }
};

const getProfile = async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    });
  } else {
    res.status(404).json({ message: 'User not found' });
  }
};

// Initial admin registration (to be used once to create the first admin)
const registerUser = async (req, res) => {
  const { name, email, password, role } = req.body;

  const userExists = await User.findOne({ email });

  if (userExists) {
    return res.status(400).json({ message: 'User already exists' });
  }

  const user = await User.create({ name, email, password, role });

  if (user) {
    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user._id)
    });
  } else {
    res.status(400).json({ message: 'Invalid user data' });
  }
};

module.exports = { loginUser, getProfile, registerUser };
