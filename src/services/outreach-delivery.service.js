const { randomUUID } = require('crypto');
const prisma = require('../config/db');
const guestRepository = require('../repositories/guest.repository');
const eventSettingRepository = require('../repositories/event-setting.repository');
const outreachScheduleService = require('./outreach-schedule.service');
const auditService = require('./audit.service');
const { publishGuestEventAsync } = require('./realtime-events');
const logger = require('../utils/logger');

const logOutreach = async ({ eventId, guestId, step, status, message, metadata }) => {
  await prisma.outreachLog.create({
    data: {
      id: randomUUID(),
      eventId,
      guestId,
      step,
      status,
      message: message || null,
      metadata: metadata || undefined
    }
  });
};

const resolveCallMode = (setting) => {
  const mode = setting?.outreachAutoCallMode === 'ivr' ? 'ivr' : 'ai';
  if (mode === 'ai' && setting?.voiceAiEnabled === false) {
    return setting?.ivrEnabled ? 'ivr' : null;
  }
  if (mode === 'ivr' && setting?.ivrEnabled === false) {
    return setting?.voiceAiEnabled ? 'ai' : null;
  }
  return mode;
};

const applyInitialWhatsAppSuccess = async (guestId, { userId, bridgeMessage } = {}) => {
  const guest = await guestRepository.findById(guestId);
  if (!guest) {
    return { applied: false, reason: 'GUEST_NOT_FOUND' };
  }

  const setting = await eventSettingRepository.findByEventId(guest.eventId);
  const now = new Date();
  const delayHours = Math.min(Math.max(setting?.outreachVoiceDelayHours || 24, 1), 48);
  const voiceAt = new Date(now.getTime() + delayHours * 60 * 60 * 1000);
  const callMode = resolveCallMode(setting);

  let scheduleResult = { scheduled: false };
  if (callMode && guest.rsvpStatus === 'PENDING' && !guest.outreachPausedAt) {
    scheduleResult = await outreachScheduleService.scheduleVoiceFollowUp(guestId, voiceAt, callMode);
  }

  const updated = await guestRepository.update(guestId, {
    outreachStatus: scheduleResult.scheduled ? 'VOICE_SCHEDULED' : 'AWAITING_RSVP',
    whatsappInitialSentAt: now,
    voiceAutoScheduledAt: scheduleResult.scheduled ? voiceAt : null,
    lastContactedAt: now,
    outreachPausedAt: null
  });

  await logOutreach({
    eventId: guest.eventId,
    guestId,
    step: 'whatsapp_initial',
    status: 'success',
    message: bridgeMessage || 'Sent via notification queue',
    metadata: { voiceAt: voiceAt.toISOString(), callMode, scheduleResult }
  });

  if (userId) {
    await auditService.enqueueAuditLog({
      eventId: guest.eventId,
      userId,
      action: 'OUTREACH_WHATSAPP_INITIAL_SENT',
      entityType: 'Guest',
      entityId: guestId,
      metadata: { voiceAt: voiceAt.toISOString(), viaQueue: true }
    });
  }

  publishGuestEventAsync(guest.eventId, 'guest_updated', updated);
  return { applied: true, guest: updated };
};

const applyInitialWhatsAppFailure = async (guestId, { message, timedOut } = {}) => {
  const guest = await guestRepository.findById(guestId);
  if (!guest) {
    return { applied: false, reason: 'GUEST_NOT_FOUND' };
  }

  await logOutreach({
    eventId: guest.eventId,
    guestId,
    step: 'whatsapp_initial',
    status: 'failed',
    message: message || 'Send failed',
    metadata: { timedOut: Boolean(timedOut) }
  });

  logger.warn('Outreach initial WhatsApp failed', { guestId, message, timedOut });
  return { applied: true };
};

const applyReminderWhatsAppSuccess = async (guestId, { bridgeMessage } = {}) => {
  const guest = await guestRepository.findById(guestId);
  if (!guest) {
    return { applied: false, reason: 'GUEST_NOT_FOUND' };
  }

  const now = new Date();
  const updated = await guestRepository.update(guestId, {
    outreachStatus: 'NEEDS_PLANNER',
    whatsappReminderSentAt: now,
    lastContactedAt: now,
    followUpStatus: guest.followUpStatus === 'NONE' ? 'NEEDS_FOLLOW_UP' : guest.followUpStatus
  });

  await logOutreach({
    eventId: guest.eventId,
    guestId,
    step: 'whatsapp_reminder',
    status: 'success',
    message: bridgeMessage || 'Sent via notification queue'
  });

  publishGuestEventAsync(guest.eventId, 'guest_updated', updated);
  return { applied: true, guest: updated };
};

const applyReminderWhatsAppFailure = async (guestId, { message, timedOut } = {}) => {
  const guest = await guestRepository.findById(guestId);
  if (!guest) {
    return { applied: false, reason: 'GUEST_NOT_FOUND' };
  }

  await logOutreach({
    eventId: guest.eventId,
    guestId,
    step: 'whatsapp_reminder',
    status: 'failed',
    message: message || 'Send failed',
    metadata: { timedOut: Boolean(timedOut) }
  });

  return { applied: true };
};

module.exports = {
  applyInitialWhatsAppSuccess,
  applyInitialWhatsAppFailure,
  applyReminderWhatsAppSuccess,
  applyReminderWhatsAppFailure
};
