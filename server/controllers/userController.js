const User = require('../models/User');
const Attendance = require('../models/Attendance');

const getUsers = async (req, res) => {
  const users = await User.find({}).select('-password');
  res.json(users);
};

const getUserById = async (req, res) => {
  const user = await User.findById(req.params.id).select('-password');
  if (user) {
    res.json(user);
  } else {
    res.status(404).json({ message: 'User not found' });
  }
};

const createUser = async (req, res) => {
  try {
    let { name, email, role, password, faceDescriptor, faceImage, department, researchPapers } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Name is required' });
    }

    if (!role) {
      role = 'student';
    }

    // Auto-generate credentials if not provided (now for all roles)
    if (!email || email.trim() === '') {
      const timestamp = Date.now();
      const cleanName = name.toLowerCase().replace(/\s+/g, '.');
      email = `${cleanName}.${timestamp % 1000}@frams.edu`;
    }

    if (!password || password.trim() === '') {
      password = `${role.toLowerCase()}@123`;
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: `User with email ${email} already exists` });
    }

    // Generate username here because Mongoose validation happens before pre-save hook
    const timestamp = Date.now().toString().slice(-4);
    const cleanName = name.toLowerCase().replace(/\s+/g, '');
    const username = `${cleanName}_${timestamp}`;

    const user = await User.create({
      name,
      username,
      email,
      role,
      password,
      faceDescriptor,
      faceImage,
      department,
      researchPapers
    });

    if (user) {
      console.log(`[USER_CONTROLLER] User registered successfully: ${user.email}`);
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    console.error(`[USER_CONTROLLER] Registration Error:`, error);
    
    // Handle specific Mongoose errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ message: `Duplicate value for ${field}` });
    }

    res.status(500).json({ 
      message: 'Server error during registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const deleteUser = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (user) {
    await User.deleteOne({ _id: user._id });
    res.json({ message: 'User removed' });
  } else {
    res.status(404).json({ message: 'User not found' });
  }
};

const deleteAllUsers = async (req, res) => {
  try {
    // Delete all users EXCEPT the current admin
    const result = await User.deleteMany({ _id: { $ne: req.user._id } });
    
    // Also clear all attendance records since users are gone
    await Attendance.deleteMany({});

    res.json({ 
      message: 'System reset successful. All users and records cleared.',
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    res.status(500).json({ message: 'Error resetting system' });
  }
};

module.exports = { getUsers, getUserById, createUser, deleteUser, deleteAllUsers };
