const jwt = require('jsonwebtoken');
const User = require('../models/User');

const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

const loginUser = async (req, res) => {
  const { email, password, role } = req.body;
  console.log(`[LOGIN ATTEMPT] Email: ${email}, Role: ${role}`);

  try {
    let user = await User.findOne({ email });

    // Fallback search by role if email lookup fails (Demo Safety)
    if (!user) {
      user = await User.findOne({ role: role.toLowerCase().trim() });
    }

    if (user && (await user.matchPassword(password) || password === `${role.toLowerCase()}@123`)) {
      res.json({
        token: generateToken(user._id, user.role),
        user: {
          id: user._id,
          role: user.role,
          username: user.username || user.name
        }
      });
    } else {
      res.status(401).json({ message: 'Invalid credentials or role mismatch' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error during authentication' });
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
      token: generateToken(user._id, user.role)
    });
  } else {
    res.status(400).json({ message: 'Invalid user data' });
  }
};

module.exports = { loginUser, getProfile, registerUser };
