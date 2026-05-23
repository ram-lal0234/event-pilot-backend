const fromShared = require('./shared');
const { processBatch } = require('./sqs-utils');

const callRepository = fromShared('repositories/call.repository');
const auditService = fromShared('services/audit.service');
const plivoService = fromShared('services/plivo.service');
const logger = fromShared('utils/logger');

const handleCallJob = async (job) => {
  const call = await callRepository.findById(job.callId);

  if (!call) {
    logger.warn('Call job skipped because call was not found', { callId: job.callId });
    return;
  }

  if (call.status !== 'QUEUED') {
    logger.info('Call job skipped because call is no longer queued', {
      callId: call.id,
      status: call.status
    });
    return;
  }

  await callRepository.update(call.id, { status: 'DIALING' });
  await auditService.enqueueAuditLog({
    eventId: call.eventId,
    action: 'CALL_DIALING',
    entityType: 'Call',
    entityId: call.id,
    metadata: {
      guestId: call.guestId
    }
  });

  try {
    const result = await plivoService.makeOutboundCall({
      callId: call.id,
      phone: call.phone
    });

    const callUuid = result.call_uuid || result.callUuid || result.request_uuid;

    if (callUuid) {
      await callRepository.update(call.id, { callUuid });
    }

    await auditService.enqueueAuditLog({
      eventId: call.eventId,
      action: 'PLIVO_CALL_REQUESTED',
      entityType: 'Call',
      entityId: call.id,
      metadata: {
        guestId: call.guestId,
        callUuid: callUuid || null
      }
    });

    logger.info('Plivo call requested', {
      callId: call.id,
      callUuid
    });
  } catch (error) {
    await callRepository.update(call.id, { status: 'FAILED' });
    await auditService.enqueueAuditLog({
      eventId: call.eventId,
      action: 'CALL_DIAL_FAILED',
      entityType: 'Call',
      entityId: call.id,
      metadata: {
        guestId: call.guestId,
        reason: error.message
      }
    });
    throw error;
  }
};

module.exports.handler = (event) => processBatch(event, handleCallJob);
