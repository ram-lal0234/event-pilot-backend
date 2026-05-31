const fromShared = require('./shared');
const { processBatch } = require('./sqs-utils');

const plivoWebhookConsumer = fromShared('services/plivo-webhook-consumer.service');
const scheduledCallbackService = fromShared('services/scheduled-callback.service');
const scheduledOutreachService = fromShared('services/scheduled-outreach.service');
const logger = fromShared('utils/logger');

const handleEventJob = async (job) => {
  const payload = job?.route ? job : { route: 'telephony', body: job };
  const result = await plivoWebhookConsumer.processPlivoWebhookJob(payload);
  logger.info('Processed Plivo webhook job', {
    route: payload.route || 'telephony',
    result
  });
};

const handleScheduledCallback = async (job) => {
  const result = await scheduledCallbackService.processScheduledCallback(job);
  logger.info('Processed scheduled callback job', {
    guestId: job.guestId,
    result
  });
  return result;
};

const handleOutreachJob = async (job) => {
  if (job.type === 'outreach_auto_call') {
    const result = await scheduledOutreachService.processOutreachAutoCall(job);
    logger.info('Processed outreach auto-call job', { guestId: job.guestId, result });
    return result;
  }

  if (job.type === 'outreach_whatsapp_reminder') {
    const result = await scheduledOutreachService.processOutreachReminder(job);
    logger.info('Processed outreach reminder job', { guestId: job.guestId, result });
    return result;
  }

  return { processed: false, reason: 'UNKNOWN_OUTREACH_JOB' };
};

module.exports.handler = async (event) => {
  if (event?.type === 'scheduled_callback') {
    return handleScheduledCallback(event);
  }

  if (event?.type === 'outreach_auto_call' || event?.type === 'outreach_whatsapp_reminder') {
    return handleOutreachJob(event);
  }

  return processBatch(event, handleEventJob);
};
