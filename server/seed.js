// Creates the demo accounts (admin/faculty/student @frams.edu). Refuses to run
// unless FRAMS_SEED_DEMO=true, and never resets passwords of existing accounts
// (the previous version silently reset admin@frams.edu to admin@123).
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '.env') });

const { seedDemoAccounts } = require('./lib/demo');

if (process.env.FRAMS_SEED_DEMO !== 'true') {
  console.error('Refusing to seed: set FRAMS_SEED_DEMO=true to create demo accounts with publicly known passwords.');
  process.exit(1);
}

mongoose.connect(process.env.MONGO_URI)
  .then(seedDemoAccounts)
  .then(() => mongoose.disconnect())
  .catch((err) => {
    console.error('Seeding failed:', err.message);
    process.exit(1);
  });
