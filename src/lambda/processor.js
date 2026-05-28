const fromShared = require('./shared');
const { processBatch } = require('./sqs-utils');

const plivoWebhookConsumer = fromShared('services/plivo-webhook-consumer.service');
const logger = fromShared('utils/logger');

const handleEventJob = async (job) => {
  const payload = job?.route ? job : { route: 'telephony', body: job };
  const result = await plivoWebhookConsumer.processPlivoWebhookJob(payload);
  logger.info('Processed Plivo webhook job', {
    route: payload.route || 'telephony',
    result
  });
};

module.exports.handler = (event) => processBatch(event, handleEventJob);
