// Read-only. Lists users with more than one attendance record on the same day,
// which prevents the FRAMS 2.0 unique (userId, date) index from being built.
// Nothing is modified; resolve duplicates manually after reviewing them.
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const dupes = await mongoose.connection.db.collection('attendances').aggregate([
    { $match: { userId: { $type: 'objectId' } } },
    { $group: { _id: { userId: '$userId', date: '$date' }, count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } },
  ]).toArray();
  if (!dupes.length) console.log('No duplicate (userId, date) attendance records.');
  for (const d of dupes) console.log(`user ${d._id.userId} on ${d._id.date}: ${d.count} records -> ${d.ids.join(', ')}`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
