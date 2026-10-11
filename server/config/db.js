const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Self-healing Seed Mechanism
    const User = require('../models/User');
    const roles = ['admin', 'faculty', 'student'];
    
    for (const role of roles) {
      const email = `${role}@frams.edu`;
      const exists = await User.findOne({ email });
      
      if (!exists) {
        console.log(`[SEED] Creating default ${role} user...`);
        await User.create({
          name: `${role.charAt(0).toUpperCase() + role.slice(1)} User`,
          username: role,
          email: email,
          password: role === 'admin' ? 'admin@123' : (role === 'faculty' ? 'faculty@123' : 'student@123'), 
          role: role
        });
      }
    }
    console.log('[SEED] System users verified.');
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
