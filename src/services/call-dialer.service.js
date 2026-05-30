const callRepository = require('../repositories/call.repository');
const auditService = require('./audit.service');
const plivoService = require('./plivo.service');
const { publishCallEventAsync } = require('./realtime-events');
const logger = require('../utils/logger');

const processCallJob = async (job) => {
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
  void publishCallEventAsync(call.eventId, 'call_started', {
    callId: call.id,
    guestId: call.guestId,
    status: 'DIALING'
  });
  await auditService.enqueueAuditLog({
    eventId: call.eventId,
    action: 'CALL_DIALING',
    entityType: 'Call',
    entityId: call.id,
    metadata: {
      guestId: call.guestId,
      callMode: job.callMode || 'ivr'
    }
  });

  try {
    const result = await plivoService.makeOutboundCall({
      callId: call.id,
      guestId: call.guestId,
      phone: call.phone,
      callMode: job.callMode || 'ivr',
      agentContext: job.agentContext
    });

    const callUuid = result.call_uuid
      || result.callUuid
      || result.data?.call_uuid
      || result.data?.object?.call_uuid
      || result.request_uuid;

    if (callUuid) {
      await callRepository.update(call.id, { callUuid });
    } else if ((job.callMode || 'ivr') === 'ai') {
      logger.warn('Agent Flow response did not include call_uuid; hangup/transcript may not link to Call row', {
        callId: call.id,
        responseKeys: Object.keys(result || {})
      });
    }

    const isAi = (job.callMode || 'ivr') === 'ai';

    await auditService.enqueueAuditLog({
      eventId: call.eventId,
      action: isAi ? 'AGENT_FLOW_CALL_REQUESTED' : 'PLIVO_CALL_REQUESTED',
      entityType: 'Call',
      entityId: call.id,
      metadata: {
        guestId: call.guestId,
        callUuid: callUuid || null,
        callMode: job.callMode || 'ivr',
        ...(isAi ? { agentFlowMessage: result.message || null } : {})
      }
    });

    logger.info(isAi ? 'Plivo Agent Flow call requested' : 'Plivo IVR call requested', {
      callId: call.id,
      callUuid,
      callMode: job.callMode || 'ivr'
    });
  } catch (error) {
    await callRepository.update(call.id, { status: 'FAILED' });
    void publishCallEventAsync(call.eventId, 'call_completed', {
      callId: call.id,
      guestId: call.guestId,
      status: 'FAILED'
    });
    await auditService.enqueueAuditLog({
      eventId: call.eventId,
      action: 'CALL_DIAL_FAILED',
      entityType: 'Call',
      entityId: call.id,
      metadata: {
        guestId: call.guestId,
        callMode: job.callMode || 'ivr',
        reason: error.message
      }
    });
    throw error;
  }
};

module.exports = {
  processCallJob
};
