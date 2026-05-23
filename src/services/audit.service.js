const queueService = require('../queue/queue.service');
const auditRepository = require('../repositories/audit.repository');
const env = require('../config/env');
const logger = require('../utils/logger');

const writeAuditLog = (payload) => {
  return auditRepository.create(payload);
};

const enqueueAuditLog = async (payload) => {
  if (env.queueProvider === 'local') {
    logger.info('Local audit log', payload);
    return;
  }

  try {
    await queueService.addJob('audit', payload);
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
