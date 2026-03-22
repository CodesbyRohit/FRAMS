const mongoose = require('mongoose');
require('dotenv').config({ path: 'server/.env' });

const User = require('./server/models/User');

const verify = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/frams');
    console.log('Connected to MongoDB');

    const students = await User.find({ role: 'student' });
    console.log(`Found ${students.length} students in the database:`);
    students.forEach(s => console.log(`- ${s.name} (${s.email})`));

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error during verification:', err);
    process.exit(1);
  }
};

verify();
