const {
  SchedulerClient,
  CreateScheduleCommand,
  DeleteScheduleCommand
} = require('@aws-sdk/client-scheduler');
const env = require('../config/env');
const logger = require('../utils/logger');

const scheduler = new SchedulerClient({ region: env.awsRegion });

const scheduleNameForGuest = (guestId) => (
  `callback-${String(guestId).replace(/[^a-zA-Z0-9-_]/g, '-')}`
);

const formatAtExpression = (date) => {
  const iso = date.toISOString().slice(0, 19);
  return `at(${iso})`;
};

const canUseScheduler = () => (
  env.queueProvider === 'sqs'
  && env.callbackScheduler?.processorLambdaArn
  && env.callbackScheduler?.roleArn
);

const scheduleCallback = async (guestId, callbackAt, { mode = 'ai' } = {}) => {
  if (!callbackAt || Number.isNaN(new Date(callbackAt).getTime())) {
    return { scheduled: false, reason: 'INVALID_CALLBACK_AT' };
  }

  const when = new Date(callbackAt);
  if (when.getTime() <= Date.now()) {
    logger.warn('Callback time is in the past; skipping schedule', { guestId, callbackAt: when });
    return { scheduled: false, reason: 'CALLBACK_IN_PAST' };
  }

  if (!canUseScheduler()) {
    logger.info('Callback schedule skipped (local or missing scheduler config)', {
      guestId,
      callbackAt: when.toISOString()
    });
    return { scheduled: false, reason: 'SCHEDULER_DISABLED' };
  }

  const name = scheduleNameForGuest(guestId);

  await scheduler.send(new CreateScheduleCommand({
    Name: name,
    ScheduleExpression: formatAtExpression(when),
    FlexibleTimeWindow: { Mode: 'OFF' },
    ActionAfterCompletion: 'DELETE',
    Target: {
      Arn: env.callbackScheduler.processorLambdaArn,
      RoleArn: env.callbackScheduler.roleArn,
      Input: JSON.stringify({
        type: 'scheduled_callback',
        guestId,
        mode
      })
    }
  }));

  logger.info('Callback scheduled', { guestId, callbackAt: when.toISOString(), scheduleName: name });

  return { scheduled: true, scheduleName: name, callbackAt: when.toISOString() };
};

const cancelCallbackSchedule = async (guestId) => {
  if (!canUseScheduler()) {
    return { cancelled: false, reason: 'SCHEDULER_DISABLED' };
  }

  const name = scheduleNameForGuest(guestId);

  try {
    await scheduler.send(new DeleteScheduleCommand({ Name: name }));
    logger.info('Callback schedule deleted', { guestId, scheduleName: name });
    return { cancelled: true };
  } catch (error) {
    if (error?.name === 'ResourceNotFoundException') {
      return { cancelled: false, reason: 'NOT_FOUND' };
    }
    throw error;
  }
};

const rescheduleCallback = async (guestId, callbackAt, options = {}) => {
  await cancelCallbackSchedule(guestId);
  if (!callbackAt) {
    return { scheduled: false, reason: 'CLEARED' };
  }
  return scheduleCallback(guestId, callbackAt, options);
};

module.exports = {
  scheduleCallback,
  cancelCallbackSchedule,
  rescheduleCallback,
  scheduleNameForGuest
};
