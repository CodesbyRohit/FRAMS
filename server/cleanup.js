const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

// Load env
dotenv.config({ path: path.join(__dirname, '.env') });

const User = require(path.join(__dirname, 'models', 'User'));
const Attendance = require(path.join(__dirname, 'models', 'Attendance'));

const cleanup = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB connected for cleanup...');

        // Drop the problematic index
        try {
            await User.collection.dropIndex('username_1');
            console.log('Successfully dropped legacy username_1 index.');
        } catch (e) {
            console.log('Legacy username_1 index not found or already dropped.');
        }

        // Update existing users to have a username if they don't
        const users = await User.find({ username: { $exists: false } });
        console.log(`Found ${users.length} users without usernames.`);

        for (const user of users) {
            const timestamp = Date.now();
            const cleanName = user.name.toLowerCase().replace(/\s+/g, '');
            user.username = `${cleanName}_${timestamp.toString().slice(-4)}`;
            await user.save();
            console.log(`Updated user ${user.email} with username: ${user.username}`);
        }

        console.log('Database cleanup and migration complete.');
        process.exit(0);
    } catch (error) {
        console.error('Cleanup error:', error);
        process.exit(1);
    }
};

cleanup();
