const prisma = require('../config/db');

const writeAuditLog = ({ eventId, userId, action, entityType, entityId, metadata = {} }) => {
  return prisma.auditLog.create({
    data: {
      eventId,
      userId,
      action,
      entityType,
      entityId,
      metadata
    }
  });
};

const enqueueAuditLog = async ({ eventId, userId, action, entityType, entityId, metadata = {} }) => {
  await writeAuditLog({ eventId, userId, action, entityType, entityId, metadata });
};

module.exports = {
  enqueueAuditLog
};
