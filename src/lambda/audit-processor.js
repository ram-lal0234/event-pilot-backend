const fromShared = require('./shared');
const { processBatch } = require('./sqs-utils');

const auditService = fromShared('services/audit.service');
const logger = fromShared('utils/logger');

const handleAuditJob = async (payload) => {
  await auditService.writeAuditLog(payload);
  logger.info('Audit log written', {
    action: payload.action,
    entityType: payload.entityType,
    entityId: payload.entityId
  });
};

module.exports.handler = (event) => processBatch(event, handleAuditJob);
