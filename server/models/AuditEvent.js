const mongoose = require('mongoose');

// Append-only record of privileged and security-relevant actions.
// Never store passwords, tokens, face descriptors or images in `details`.
const auditEventSchema = new mongoose.Schema({
  action: { type: String, required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorName: String,
  actorRole: String,
  targetType: String,
  targetId: String,
  details: { type: mongoose.Schema.Types.Mixed },
  ip: String,
  createdAt: { type: Date, default: Date.now },
});

auditEventSchema.index({ createdAt: -1 });
auditEventSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('AuditEvent', auditEventSchema);
