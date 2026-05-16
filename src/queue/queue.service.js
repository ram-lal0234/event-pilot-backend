const env = require('../config/env');
const logger = require('../utils/logger');
const { getQueue } = require('./bullmq');

const queueMap = {
  ivr: 'ivrQueue',
  audit: 'auditQueue',
  notification: 'notificationQueue'
};

const addBullMqJob = async (type, payload, options = {}) => {
  const queueName = queueMap[type];

  if (!queueName) {
    throw new Error(`Unsupported queue type: ${type}`);
  }

  const queue = getQueue(queueName);
  return queue.add(type, payload, options);
};

const addSqsJob = async (type, payload) => {
  logger.info('SQS queue provider selected but not configured; job logged only', {
    type,
    payload
  });
};

const addJob = async (type, payload, options = {}) => {
  if (env.queueProvider === 'sqs') {
    return addSqsJob(type, payload, options);
  }

  return addBullMqJob(type, payload, options);
};

module.exports = {
  addJob
};
