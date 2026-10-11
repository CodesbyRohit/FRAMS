const mongoose = require('mongoose');

const correctionRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD the student says they attended
  reason: { type: String, required: true, maxlength: 1000 },
  status: { type: String, enum: ['pending', 'approved', 'denied'], default: 'pending' },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolvedByName: String,
  resolvedAt: Date,
  resolutionNote: { type: String, maxlength: 1000 },
  createdAt: { type: Date, default: Date.now },
});

correctionRequestSchema.index({ userId: 1, createdAt: -1 });
correctionRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('CorrectionRequest', correctionRequestSchema);
