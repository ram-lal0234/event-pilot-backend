const queueService = require('../queue/queue.service');
const env = require('../config/env');
const plivoWebhookConsumer = require('./plivo-webhook-consumer.service');
const voiceAiService = require('./voice-ai.service');
const logger = require('../utils/logger');

const detectAiRoute = (body = {}) => {
  if (voiceAiService.isRsvpResultEvent(body)) {
    return 'ai/rsvp';
  }

  if (voiceAiService.isLifecycleEvent(body)) {
    return 'ai/hangup';
  }

  return 'ai/hangup';
};

const enqueuePlivoWebhook = async ({ route, body, query = {}, headers = {} }) => {
  const job = {
    route,
    body,
    query,
    headers,
    receivedAt: new Date().toISOString()
  };

  if (env.queueProvider === 'sqs') {
    await queueService.addJob('event', job);
    logger.info('Plivo webhook enqueued', { route });
    return { queued: true, route };
  }

  const result = await plivoWebhookConsumer.processPlivoWebhookJob(job);
  logger.info('Plivo webhook processed inline (local queue)', { route });
  return { queued: false, route, result };
};

const enqueueAiWebhook = async ({ body, query, headers, route }) => {
  const resolvedRoute = route || detectAiRoute(body);
  return enqueuePlivoWebhook({
    route: resolvedRoute,
    body,
    query,
    headers
  });
};

const enqueueTelephonyWebhook = async ({ body, query, headers }) => enqueuePlivoWebhook({
  route: 'telephony',
  body: { ...query, ...body },
  query,
  headers
});

module.exports = {
  detectAiRoute,
  enqueuePlivoWebhook,
  enqueueAiWebhook,
  enqueueTelephonyWebhook
};
