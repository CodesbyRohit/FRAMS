const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, 'server', '.env') });

const User = require('./server/models/User');

const check = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const total = await User.countDocuments({});
        const withBiometrics = await User.countDocuments({ faceDescriptor: { $exists: true, $ne: [] } });
        console.log(`Total Users: ${total}`);
        console.log(`Users with Biometrics: ${withBiometrics}`);
        
        const sample = await User.findOne({ faceDescriptor: { $exists: true, $ne: [] } });
        if (sample) {
            console.log('Sample faceDescriptor type:', typeof sample.faceDescriptor);
            console.log('Is it an array?', Array.isArray(sample.faceDescriptor));
            console.log('Length:', sample.faceDescriptor.length);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

check();
