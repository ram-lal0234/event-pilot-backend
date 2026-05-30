const fromShared = require('./shared');
const { processBatch } = require('./sqs-utils');

const plivoWebhookConsumer = fromShared('services/plivo-webhook-consumer.service');
const scheduledCallbackService = fromShared('services/scheduled-callback.service');
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

module.exports.handler = async (event) => {
  if (event?.type === 'scheduled_callback') {
    return handleScheduledCallback(event);
  }

  return processBatch(event, handleEventJob);
};
