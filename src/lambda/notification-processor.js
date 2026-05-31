const fromShared = require('./shared');
const { processBatch } = require('./sqs-utils');

const notificationConsumer = fromShared('services/notification-consumer.service');
const logger = fromShared('utils/logger');

const handleNotificationJob = async (job) => {
  const result = await notificationConsumer.processNotificationJob(job);
  logger.info('Processed notification job', {
    channel: job.channel,
    id: job.id,
    success: result.success
  });
  return result;
};

module.exports.handler = (event) => processBatch(event, handleNotificationJob);
