const env = require('../config/env');
const logger = require('../utils/logger');

const queueMap = {
  ivr: 'call',
  call: 'call',
  event: 'event',
  audit: 'audit',
  notification: 'notification'
};

let sqsClient;

const getSqsClient = () => {
  if (!sqsClient) {
    const { SQSClient } = require('@aws-sdk/client-sqs');
    sqsClient = new SQSClient({ region: env.awsRegion });
  }

  return sqsClient;
};

const getQueueName = (type) => {
  const queueName = queueMap[type];

  if (!queueName || !env.queues[queueName]) {
    throw new Error(`Unsupported queue type: ${type}`);
  }

  return queueName;
};

const addSqsJob = async (type, payload, options = {}) => {
  const { SendMessageCommand } = require('@aws-sdk/client-sqs');
  const queueName = getQueueName(type);
  const queueUrl = env.queues[queueName];

  const command = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify({
      type,
      payload,
      queuedAt: new Date().toISOString()
    }),
    ...(options.delaySeconds ? { DelaySeconds: options.delaySeconds } : {})
  });

  const result = await getSqsClient().send(command);

  logger.info('SQS job enqueued', {
    type,
    queueName,
    messageId: result.MessageId
  });

  return result;
};

const addLocalJob = async (type, payload) => {
  if (type === 'notification') {
    const notificationConsumer = require('../services/notification-consumer.service');
    logger.info('Processing notification job locally', {
      channel: payload.channel,
      id: payload.id
    });
    return notificationConsumer.processNotificationJob(payload);
  }

  logger.info('Local queue provider selected; job logged only', {
    type,
    payload
  });
};

const addJob = async (type, payload, options = {}) => {
  if (env.queueProvider === 'sqs') {
    return addSqsJob(type, payload, options);
  }

  if (env.queueProvider === 'local') {
    return addLocalJob(type, payload, options);
  }

  throw new Error(`Unsupported queue provider: ${env.queueProvider}`);
};

module.exports = {
  addJob
};
