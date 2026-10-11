const User = require('../models/User');

// Demo accounts are created only when FRAMS_SEED_DEMO=true. They have no face data
// and no attendance; enroll synthetic or consenting test faces through the UI.
const DEMO_ACCOUNTS = [
  { role: 'admin', name: 'Demo Admin', email: 'admin@frams.edu', password: 'admin@123' },
  { role: 'faculty', name: 'Demo Faculty', email: 'faculty@frams.edu', password: 'faculty@123' },
  { role: 'student', name: 'Demo Student', email: 'student@frams.edu', password: 'student@123' },
];

const seedDemoAccounts = async () => {
  for (const a of DEMO_ACCOUNTS) {
    if (!(await User.exists({ email: a.email }))) {
      await User.create({ ...a, username: `demo_${a.role}` });
      console.log(`[DEMO] Created ${a.role} account ${a.email}`);
    }
  }
};

// The original server re-created these accounts with known passwords on every
// start. Turning seeding off does not remove them from an existing database.
const warnAboutDefaultPasswords = async () => {
  for (const a of DEMO_ACCOUNTS) {
    const user = await User.findOne({ email: a.email });
    if (user && (await user.matchPassword(a.password))) {
      console.warn(`[SECURITY] ${a.email} still uses its publicly known default password. Change it or delete the account.`);
    }
  }
};

module.exports = { DEMO_ACCOUNTS, seedDemoAccounts, warnAboutDefaultPasswords };
