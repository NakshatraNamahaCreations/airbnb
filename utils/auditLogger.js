import AuditLog from '../models/auditLog.model.js';

/**
 * Write an audit entry. Never throws — audit failure must not break the action.
 *
 * @param {Object} req - express req (used to pull admin + ip/UA)
 * @param {Object} entry - { action, target: { model, id }, payload? }
 */
const writeAudit = async (req, { action, target, payload = {} }) => {
  try {
    if (!req.adminId) return; // only admin actions are audited
    await AuditLog.create({
      actorAdminId: req.adminId,
      actorEmail: req.admin?.email,
      action,
      target,
      payload,
      ip: req.ip,
      userAgent: req.get('user-agent') || '',
    });
  } catch (err) {
    console.error('audit write failed:', err?.message);
  }
};

export { writeAudit };
