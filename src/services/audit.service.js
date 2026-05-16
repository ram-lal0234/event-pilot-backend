const queueService = require('../queue/queue.service');
const prisma = require('../config/db');
const logger = require('../utils/logger');

const enqueueAuditLog = async ({ eventId, action, entityType, entityId, metadata = {} }) => {
  try {
    await queueService.addJob('audit', {
      eventId,
      action,
      entityType,
      entityId,
      metadata
    });
  } catch (error) {
    logger.warn('Audit queue unavailable; writing audit log synchronously', {
      error: error.message,
      action,
      entityType,
      entityId
    });

    await prisma.auditLog.create({
      data: {
        eventId,
        action,
        entityType,
        entityId,
        metadata
      }
    });
  }
};

module.exports = {
  enqueueAuditLog
};
