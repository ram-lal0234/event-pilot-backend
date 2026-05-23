const fromShared = require('./shared');
const { processBatch } = require('./sqs-utils');

const callRepository = fromShared('repositories/call.repository');
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

  try {
    const result = await plivoService.makeOutboundCall({
      callId: call.id,
      phone: call.phone
    });

    const callUuid = result.call_uuid || result.callUuid || result.request_uuid;

    if (callUuid) {
      await callRepository.update(call.id, { callUuid });
    }

    logger.info('Plivo call requested', {
      callId: call.id,
      callUuid
    });
  } catch (error) {
    await callRepository.update(call.id, { status: 'FAILED' });
    throw error;
  }
};

module.exports.handler = (event) => processBatch(event, handleCallJob);
