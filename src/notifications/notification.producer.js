const { randomUUID } = require('crypto');
const queueService = require('../queue/queue.service');
const logger = require('../utils/logger');

const buildEnvelope = (payload) => ({
  id: payload.id || randomUUID(),
  channel: payload.channel,
  idempotencyKey: payload.idempotencyKey || null,
  metadata: payload.metadata || {},
  whatsapp: payload.whatsapp || null,
  email: payload.email || null,
  queuedAt: new Date().toISOString()
});

const enqueue = async (payload) => {
  if (payload.channel === 'whatsapp' && !payload.whatsapp) {
    throw new Error('WhatsApp channel requires whatsapp payload');
  }
  if (payload.channel === 'email' && !payload.email) {
    throw new Error('Email channel requires email payload');
  }

  const envelope = buildEnvelope(payload);

  const result = await queueService.addJob('notification', envelope);

  logger.info('Notification queued', {
    channel: envelope.channel,
    id: envelope.id,
    idempotencyKey: envelope.idempotencyKey,
    messageId: result?.MessageId
  });

  return { queued: true, id: envelope.id, messageId: result?.MessageId };
};

const enqueueWhatsApp = (whatsapp, options = {}) => enqueue({
  channel: 'whatsapp',
  whatsapp,
  idempotencyKey: options.idempotencyKey,
  metadata: options.metadata
});

const enqueueEmail = (email, options = {}) => enqueue({
  channel: 'email',
  email,
  idempotencyKey: options.idempotencyKey,
  metadata: options.metadata
});

module.exports = {
  enqueue,
  enqueueWhatsApp,
  enqueueEmail
};
