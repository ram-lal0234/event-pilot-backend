const notificationDelivery = require('../notifications/notification-delivery.service');
const outreachDelivery = require('./outreach-delivery.service');
const logger = require('../utils/logger');
const AppError = require('../utils/AppError');

const OUTREACH_STEPS = new Set(['whatsapp_initial', 'whatsapp_reminder']);

const handleOutreachSideEffects = async (metadata, result) => {
  const step = metadata?.outreachStep;
  const guestId = metadata?.guestId;

  if (!step || !guestId || !OUTREACH_STEPS.has(step)) {
    return;
  }

  if (result.success) {
    if (step === 'whatsapp_initial') {
      await outreachDelivery.applyInitialWhatsAppSuccess(guestId, {
        userId: metadata.userId,
        bridgeMessage: result.message
      });
      return;
    }

    if (step === 'whatsapp_reminder') {
      await outreachDelivery.applyReminderWhatsAppSuccess(guestId, {
        bridgeMessage: result.message
      });
    }

    return;
  }

  if (step === 'whatsapp_initial') {
    await outreachDelivery.applyInitialWhatsAppFailure(guestId, {
      message: result.message,
      timedOut: result.timedOut
    });
    return;
  }

  if (step === 'whatsapp_reminder') {
    await outreachDelivery.applyReminderWhatsAppFailure(guestId, {
      message: result.message,
      timedOut: result.timedOut
    });
  }
};

const processNotificationJob = async (job) => {
  const channel = job?.channel;

  if (!channel) {
    throw new AppError('Notification job missing channel', 400, 'INVALID_NOTIFICATION_JOB');
  }

  let result;

  if (channel === 'whatsapp') {
    result = await notificationDelivery.sendWhatsApp(job.whatsapp);
  } else if (channel === 'email') {
    result = await notificationDelivery.sendEmail(job.email);
  } else {
    throw new AppError(`Unknown notification channel: ${channel}`, 400, 'INVALID_NOTIFICATION_CHANNEL');
  }

  await handleOutreachSideEffects(job.metadata, result);

  if (!result.success) {
    const code = result.code || 'NOTIFICATION_SEND_FAILED';
    const error = new AppError(result.message || 'Notification send failed', 502, code);
    error.timedOut = result.timedOut;
    throw error;
  }

  logger.info('Notification delivered', {
    channel,
    id: job.id,
    idempotencyKey: job.idempotencyKey
  });

  return result;
};

module.exports = {
  processNotificationJob,
  OUTREACH_STEPS
};
