import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  actorAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true, index: true },
  actorEmail: { type: String },
  action: { type: String, required: true, index: true }, // e.g. user.suspend, listing.approve
  target: {
    model: { type: String, required: true },     // e.g. 'User', 'Listing'
    id: { type: mongoose.Schema.Types.ObjectId }, // doc id (optional for bulk actions)
  },
  payload: { type: Object, default: {} },         // request body / before-after diff snippet
  ip: { type: String },
  userAgent: { type: String },
}, { timestamps: { createdAt: true, updatedAt: false } });

auditLogSchema.index({ createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
