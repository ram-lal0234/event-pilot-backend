const {
  SchedulerClient,
  CreateScheduleCommand,
  DeleteScheduleCommand
} = require('@aws-sdk/client-scheduler');
const env = require('../config/env');
const logger = require('../utils/logger');

const scheduler = new SchedulerClient({ region: env.awsRegion });

const localTimers = new Map();

const voiceScheduleName = (guestId) => (
  `outreach-voice-${String(guestId).replace(/[^a-zA-Z0-9-_]/g, '-')}`
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

const runLocalJob = (guestId, jobType, delayMs, payload = {}) => {
  const key = `${jobType}:${guestId}`;
  const existing = localTimers.get(key);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(async () => {
    localTimers.delete(key);
    try {
      const scheduledOutreachService = require('./scheduled-outreach.service');
      if (jobType === 'outreach_auto_call') {
        await scheduledOutreachService.processOutreachAutoCall(payload);
      } else if (jobType === 'outreach_whatsapp_reminder') {
        await scheduledOutreachService.processOutreachReminder(payload);
      }
    } catch (error) {
      logger.error(error, { guestId, jobType, context: 'outreach-local-scheduler' });
    }
  }, delayMs);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  localTimers.set(key, timer);
  return { scheduled: true, local: true, delayMs };
};

const scheduleAt = async (name, when, input) => {
  if (!when || Number.isNaN(new Date(when).getTime())) {
    return { scheduled: false, reason: 'INVALID_WHEN' };
  }

  const fireAt = new Date(when);
  if (fireAt.getTime() <= Date.now()) {
    return { scheduled: false, reason: 'IN_PAST' };
  }

  if (!canUseScheduler()) {
    const delayMs = fireAt.getTime() - Date.now();
    logger.info('Outreach schedule using local timer', {
      name,
      fireAt: fireAt.toISOString(),
      delayMs,
      type: input.type
    });
    return runLocalJob(input.guestId, input.type, delayMs, input);
  }

  await scheduler.send(new CreateScheduleCommand({
    Name: name,
    ScheduleExpression: formatAtExpression(fireAt),
    FlexibleTimeWindow: { Mode: 'OFF' },
    ActionAfterCompletion: 'DELETE',
    Target: {
      Arn: env.callbackScheduler.processorLambdaArn,
      RoleArn: env.callbackScheduler.roleArn,
      Input: JSON.stringify(input)
    }
  }));

  logger.info('Outreach schedule created', { name, fireAt: fireAt.toISOString(), type: input.type });
  return { scheduled: true, scheduleName: name, fireAt: fireAt.toISOString() };
};

const deleteSchedule = async (name, guestId, jobType) => {
  const localKey = `${jobType}:${guestId}`;
  const localTimer = localTimers.get(localKey);
  if (localTimer) {
    clearTimeout(localTimer);
    localTimers.delete(localKey);
    return { cancelled: true, local: true };
  }

  if (!canUseScheduler()) {
    return { cancelled: false, reason: 'SCHEDULER_DISABLED' };
  }

  try {
    await scheduler.send(new DeleteScheduleCommand({ Name: name }));
    return { cancelled: true };
  } catch (error) {
    if (error?.name === 'ResourceNotFoundException') {
      return { cancelled: false, reason: 'NOT_FOUND' };
    }
    throw error;
  }
};

const scheduleVoiceFollowUp = async (guestId, fireAt, mode = 'ai') => scheduleAt(
  voiceScheduleName(guestId),
  fireAt,
  { type: 'outreach_auto_call', guestId, mode }
);

const cancelVoiceFollowUp = async (guestId) => deleteSchedule(
  voiceScheduleName(guestId),
  guestId,
  'outreach_auto_call'
);

const runReminderSoon = async (guestId) => runLocalJob(
  guestId,
  'outreach_whatsapp_reminder',
  5_000,
  { type: 'outreach_whatsapp_reminder', guestId }
);

module.exports = {
  scheduleVoiceFollowUp,
  cancelVoiceFollowUp,
  runReminderSoon,
  voiceScheduleName
};
