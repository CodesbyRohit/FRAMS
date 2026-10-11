const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const connectDB = require('./config/db');
const { createApp } = require('./app');
const { seedDemoAccounts, warnAboutDefaultPasswords } = require('./lib/demo');

const start = async () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error('JWT_SECRET must be set to a random value of at least 32 characters. See server/.env.example.');
    process.exit(1);
  }
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set. See server/.env.example.');
    process.exit(1);
  }

  await connectDB();

  if (process.env.FRAMS_SEED_DEMO === 'true') {
    await seedDemoAccounts();
    console.warn('[DEMO] Demo mode is ON. Do not use this configuration with real people.');
  } else {
    await warnAboutDefaultPasswords();
  }

  const PORT = process.env.PORT || 5000;
  createApp().listen(PORT, () => {
    console.log(`FRAMS API listening on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  });
};

start().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
