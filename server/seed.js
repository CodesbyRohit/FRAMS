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
        username: 'admin',
        email: 'admin@frams.edu',
        password: 'admin@123',
        role: 'admin'
      });
      console.log('Initial Admin created: admin@frams.edu / admin@123');
    } else {
      admin.username = 'admin';
      admin.password = 'admin@123';
      admin.role = 'admin';
      await admin.save();
      console.log('Admin credentials updated to: admin@frams.edu / admin@123');
    }

    // Seed Faculty
    let faculty = await User.findOne({ email: 'faculty@frams.edu' });
    if (!faculty) {
      await User.create({
        name: 'Faculty Officer',
        username: 'faculty',
        email: 'faculty@frams.edu',
        password: 'faculty@123',
        role: 'faculty'
      });
      console.log('Faculty created: faculty@frams.edu / faculty@123');
    }

    // Seed Student
    let student = await User.findOne({ email: 'student@frams.edu' });
    if (!student) {
      await User.create({
        name: 'Student Cadet',
        username: 'student',
        email: 'student@frams.edu',
        password: 'student@123',
        role: 'student'
      });
      console.log('Student created: student@frams.edu / student@123');
    }

    process.exit();
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  }
};

seedAdmin();
