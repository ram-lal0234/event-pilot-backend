const queueService = require('../queue/queue.service');
const auditRepository = require('../repositories/audit.repository');
const env = require('../config/env');
const logger = require('../utils/logger');

const logAuditEvent = (message, payload, extra = {}) => {
  logger.info(message, {
    action: payload.action,
    eventId: payload.eventId,
    userId: payload.userId,
    entityType: payload.entityType,
    entityId: payload.entityId,
    ...extra
  });
};

const writeAuditLog = async (payload) => {
  const item = await auditRepository.create(payload);
  logAuditEvent('Audit log persisted', payload, { auditLogId: item.id });
  return item;
};

const enqueueAuditLog = async (payload) => {
  if (env.queueProvider === 'local') {
    const item = await writeAuditLog(payload);
    logAuditEvent('Audit log recorded locally', payload, { auditLogId: item.id });
    return item;
  }

  try {
    const result = await queueService.addJob('audit', payload);
    logAuditEvent('Audit log queued', payload, { messageId: result?.MessageId });
  } catch (error) {
    logger.error(error, {
      action: payload.action,
      entityType: payload.entityType,
      entityId: payload.entityId
    });
  }
};

module.exports = {
  enqueueAuditLog,
  writeAuditLog
};
