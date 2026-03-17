const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const fix = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('users');

    // 1. Drop the index
    try {
      await collection.dropIndex('username_1');
      console.log('Dropped username_1 index');
    } catch (e) {
      console.log('Index username_1 not found');
    }

    // 2. Ensure everyone has a unique username to avoid re-creation errors
    const users = await collection.find({ username: { $exists: false } }).toArray();
    console.log(`Updating ${users.length} users...`);

    for (const user of users) {
      const timestamp = Date.now() + Math.floor(Math.random() * 1000);
      const username = `user_${timestamp}`;
      await collection.updateOne({ _id: user._id }, { $set: { username } });
    }

    console.log('Fix complete!');
    process.exit(0);
  } catch (err) {
    console.error('Fix failed:', err);
    process.exit(1);
  }
};

fix();
