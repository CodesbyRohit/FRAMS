const mongoose = require('mongoose');

// One record per user per calendar day. Fields added in FRAMS 2.0 are optional so
// that records written by the original system remain valid.
const attendanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  name: { type: String, required: true },
  role: { type: String, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD, institution time zone
  time: { type: String, required: true }, // HH:MM:SS
  // null for manual / correction records, which have no face match.
  confidenceScore: { type: Number, default: null },
  status: { type: String, enum: ['present', 'unknown', 'pending_review', 'rejected'], default: 'present' },
  method: { type: String, enum: ['face', 'manual', 'correction'], default: 'face' },

  // Model-generated signals (face records only)
  matchDistance: Number,
  liveness: {
    frames: Number,
    blinkCount: Number,
    movementScore: Number,
    scanTimeMs: Number,
    source: { type: String, enum: ['client'] }, // liveness is measured in the browser
  },
  behaviorSimilarity: Number,
  riskLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'LOW' },
  riskScore: { type: Number, default: 0 },
  riskReason: { type: String, default: 'Normal behavior' },
  riskReasons: [String],

  // Human decision
  reviewStatus: { type: String, enum: ['none', 'pending', 'confirmed', 'rejected'], default: 'none' },
  reviewReasons: [String],
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  reviewNote: String,

  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

// Atomic duplicate prevention. If legacy duplicates exist the index build fails
// (logged, non-fatal); run `npm run check:duplicates` in server/ to list them.
attendanceSchema.index(
  { userId: 1, date: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } }
);
attendanceSchema.index({ reviewStatus: 1, createdAt: -1 });
attendanceSchema.index({ date: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
