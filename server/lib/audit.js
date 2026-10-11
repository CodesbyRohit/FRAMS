const AuditEvent = require('../models/AuditEvent');

// Best-effort: an audit write failure is logged but never fails the request.
const audit = async (req, action, { targetType, targetId, details, actor } = {}) => {
  const who = actor || req.user;
  try {
    await AuditEvent.create({
      action,
      actorId: who?._id,
      actorName: who?.name,
      actorRole: who?.role,
      targetType,
      targetId: targetId != null ? String(targetId) : undefined,
      details,
      ip: req.ip,
    });
  } catch (err) {
    console.error(`[AUDIT] Failed to record ${action}:`, err.message);
  }
};

module.exports = audit;
