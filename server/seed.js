const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const User = require('./models/User');

dotenv.config({ path: path.join(__dirname, '.env') });

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected for seeding...');

    let admin = await User.findOne({ email: 'admin@frams.edu' });
    if (!admin) {
      admin = await User.create({
        name: 'System Admin',
        email: 'admin@frams.edu',
        password: 'admin@123',
        role: 'admin'
      });
      console.log('Initial Admin created: admin@frams.edu / admin@123');
    } else {
      admin.password = 'admin@123';
      admin.role = 'admin';
      await admin.save();
      console.log('Admin credentials updated to: admin@frams.edu / admin@123');
    }

    process.exit();
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  }
};

seedAdmin();
