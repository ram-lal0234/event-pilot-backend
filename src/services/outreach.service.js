const { randomUUID, randomBytes } = require('crypto');
const prisma = require('../config/db');
const guestRepository = require('../repositories/guest.repository');
const guestInviteRepository = require('../repositories/guest-invite.repository');
const eventSettingRepository = require('../repositories/event-setting.repository');
const outreachScheduleService = require('./outreach-schedule.service');
const notificationProducer = require('../notifications/notification.producer');
const notificationDelivery = require('../notifications/notification-delivery.service');
const voiceCallService = require('./voice-call.service');
const auditService = require('./audit.service');
const { publishGuestEventAsync } = require('./realtime-events');
const accessService = require('./access.service');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { buildPublicRsvpUrl } = require('../utils/public-rsvp.util');
const { buildInitialMessage, buildReminderMessage } = require('../utils/outreach-message.util');

const TERMINAL_FAILED_OUTCOMES = new Set(['no_answer', 'voicemail', 'wrong_person', 'opted_out']);

const ACTIVE_OUTREACH = new Set([
  'WHATSAPP_INITIAL_SENT',
  'AWAITING_RSVP',
  'VOICE_SCHEDULED',
  'VOICE_ATTEMPTED'
]);

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

const loadGuestContext = async (guestId) => {
  const guest = await guestRepository.findByIdWithEvent(guestId);
  if (!guest) {
    return null;
  }

  const setting = await eventSettingRepository.findByEventId(guest.eventId);
  let invite = await guestInviteRepository.findByGuestId(guestId);
  if (!invite) {
    invite = await guestInviteRepository.create({
      guestId,
      code: randomBytes(16).toString('hex')
    });
  }

  return { guest, setting, invite };
};

const assertCanRunOutreach = (guest, setting) => {
  if (!setting?.outreachEnabled) {
    return { ok: false, reason: 'OUTREACH_DISABLED' };
  }
  if (guest.outreachPausedAt) {
    return { ok: false, reason: 'OUTREACH_PAUSED' };
  }
  if (guest.rsvpStatus !== 'PENDING') {
    return { ok: false, reason: 'RSVP_NOT_PENDING' };
  }
  return { ok: true };
};

const completeOutreach = async (guestId, reason = 'rsvp_captured') => {
  const guest = await guestRepository.findById(guestId);
  if (!guest) {
    return { completed: false, reason: 'GUEST_NOT_FOUND' };
  }

  await outreachScheduleService.cancelVoiceFollowUp(guestId);

  const updated = await guestRepository.update(guestId, {
    outreachStatus: 'COMPLETE',
    outreachPausedAt: null
  });

  await logOutreach({
    eventId: guest.eventId,
    guestId,
    step: 'complete',
    status: 'success',
    message: reason
  });

  publishGuestEventAsync(guest.eventId, 'guest_updated', updated);
  return { completed: true, guest: updated };
};

const sendInitialWhatsApp = async (guestId, { userId } = {}) => {
  const context = await loadGuestContext(guestId);
  if (!context) {
    throw new AppError('Guest not found', 404, 'GUEST_NOT_FOUND');
  }

  const { guest, setting, invite } = context;
  const gate = assertCanRunOutreach(guest, setting);
  if (!gate.ok) {
    return { queued: false, sent: false, reason: gate.reason };
  }

  const recipient = notificationDelivery.phoneToWhatsAppRecipient(guest.phone);
  if (!recipient) {
    await logOutreach({
      eventId: guest.eventId,
      guestId,
      step: 'whatsapp_initial',
      status: 'failed',
      message: 'Invalid phone for WhatsApp'
    });
    return { queued: false, sent: false, reason: 'INVALID_PHONE' };
  }

  const rsvpLink = buildPublicRsvpUrl(invite.code);
  const message = buildInitialMessage(guest, guest.event, rsvpLink, setting);

  try {
    await notificationProducer.enqueueWhatsApp(
      { recipient, message },
      {
        idempotencyKey: `outreach:initial:${guestId}`,
        metadata: {
          outreachStep: 'whatsapp_initial',
          guestId,
          eventId: guest.eventId,
          userId: userId || null
        }
      }
    );
  } catch (error) {
    logger.error(error, { guestId, context: 'queue_initial_whatsapp' });
    return { queued: false, sent: false, reason: 'QUEUE_FAILED', detail: error.message };
  }

  return { queued: true, sent: false, guestId };
};

const sendReminderWhatsApp = async (guestId) => {
  const context = await loadGuestContext(guestId);
  if (!context) {
    return { queued: false, sent: false, reason: 'GUEST_NOT_FOUND' };
  }

  const { guest, setting, invite } = context;

  if (!setting?.outreachEnabled || !setting?.outreachReminderEnabled) {
    return { queued: false, sent: false, reason: 'REMINDER_DISABLED' };
  }
  if (guest.whatsappReminderSentAt) {
    return { queued: false, sent: false, reason: 'REMINDER_ALREADY_SENT' };
  }
  if (guest.rsvpStatus !== 'PENDING') {
    return { queued: false, sent: false, reason: 'RSVP_NOT_PENDING' };
  }

  const recipient = notificationDelivery.phoneToWhatsAppRecipient(guest.phone);
  if (!recipient) {
    return { queued: false, sent: false, reason: 'INVALID_PHONE' };
  }

  const rsvpLink = buildPublicRsvpUrl(invite.code);
  const message = buildReminderMessage(guest, guest.event, rsvpLink, setting);

  try {
    await notificationProducer.enqueueWhatsApp(
      { recipient, message },
      {
        idempotencyKey: `outreach:reminder:${guestId}`,
        metadata: {
          outreachStep: 'whatsapp_reminder',
          guestId,
          eventId: guest.eventId
        }
      }
    );
  } catch (error) {
    logger.error(error, { guestId, context: 'queue_reminder_whatsapp' });
    return { queued: false, sent: false, reason: 'QUEUE_FAILED', detail: error.message };
  }

  return { queued: true, sent: false, guestId };
};

const pauseOutreach = async (guestId, user) => {
  const guest = await guestRepository.findById(guestId);
  if (!guest) {
    throw new AppError('Guest not found', 404, 'GUEST_NOT_FOUND');
  }

  await accessService.assertEventAccess(user.id, guest.eventId, { level: 'FULL' });
  await outreachScheduleService.cancelVoiceFollowUp(guestId);

  const updated = await guestRepository.update(guestId, {
    outreachStatus: 'PAUSED',
    outreachPausedAt: new Date()
  });

  publishGuestEventAsync(guest.eventId, 'guest_updated', updated);
  return updated;
};

const startOutreachForGuest = async (guestId, user) => {
  const guest = await guestRepository.findById(guestId);
  if (!guest) {
    throw new AppError('Guest not found', 404, 'GUEST_NOT_FOUND');
  }

  await accessService.assertEventAccess(user.id, guest.eventId, { level: 'FULL' });
  return sendInitialWhatsApp(guestId, { userId: user.id });
};

const startOutreachForEvent = async (eventId, user) => {
  await accessService.assertEventAccess(user.id, eventId, { level: 'FULL' });

  const setting = await eventSettingRepository.findByEventId(eventId);
  if (!setting?.outreachEnabled) {
    throw new AppError('Enable WhatsApp outreach in event settings first', 400, 'OUTREACH_DISABLED');
  }

  const guests = await prisma.guest.findMany({
    where: {
      eventId,
      deletedAt: null,
      rsvpStatus: 'PENDING',
      outreachStatus: { in: ['IDLE', 'PAUSED'] }
    },
    select: { id: true }
  });

  const results = [];
  for (const { id } of guests) {
    // eslint-disable-next-line no-await-in-loop
    const result = await sendInitialWhatsApp(id, { userId: user.id });
    results.push({ guestId: id, ...result });
  }

  const queued = results.filter((item) => item.queued).length;
  const failed = results.length - queued;

  await auditService.enqueueAuditLog({
    eventId,
    userId: user.id,
    action: 'OUTREACH_BATCH_STARTED',
    entityType: 'Event',
    entityId: eventId,
    metadata: { total: results.length, queued, failed }
  });

  return { total: results.length, queued, sent: queued, failed, results };
};

const maybeAutoStartForGuest = async (guestId) => {
  const context = await loadGuestContext(guestId);
  if (!context) {
    return { started: false, reason: 'GUEST_NOT_FOUND' };
  }

  const { guest, setting } = context;
  if (!setting?.outreachEnabled || !setting?.outreachAutoStart) {
    return { started: false, reason: 'AUTO_START_DISABLED' };
  }
  if (guest.outreachStatus !== 'IDLE') {
    return { started: false, reason: 'ALREADY_STARTED' };
  }

  const result = await sendInitialWhatsApp(guestId);
  return { started: result.queued, ...result };
};

const handleCallOutcomeForOutreach = async (guestId, callOutcome, { rsvpUpdated } = {}) => {
  const guest = await guestRepository.findById(guestId);
  if (!guest) {
    return { handled: false, reason: 'GUEST_NOT_FOUND' };
  }

  if (rsvpUpdated && guest.rsvpStatus !== 'PENDING') {
    return completeOutreach(guestId, 'rsvp_via_call');
  }

  if (!ACTIVE_OUTREACH.has(guest.outreachStatus) && guest.outreachStatus !== 'VOICE_ATTEMPTED') {
    return { handled: false, reason: 'NOT_IN_OUTREACH' };
  }

  if (!TERMINAL_FAILED_OUTCOMES.has(callOutcome)) {
    return { handled: false, reason: 'NOT_TERMINAL_FAILURE' };
  }

  const setting = await eventSettingRepository.findByEventId(guest.eventId);
  if (!setting?.outreachReminderEnabled) {
    await guestRepository.update(guestId, { outreachStatus: 'NEEDS_PLANNER' });
    return { handled: true, reminder: false, reason: 'REMINDER_DISABLED' };
  }

  return sendReminderWhatsApp(guestId);
};

const getOutreachSummary = async (eventId, user) => {
  await accessService.assertEventAccess(user.id, eventId, { level: 'READ' });

  const setting = await eventSettingRepository.findByEventId(eventId);
  const counts = await prisma.guest.groupBy({
    by: ['outreachStatus'],
    where: { eventId, deletedAt: null },
    _count: { _all: true }
  });

  const byStatus = counts.reduce((acc, row) => {
    acc[row.outreachStatus] = row._count._all;
    return acc;
  }, {});

  const pendingRsvp = await prisma.guest.count({
    where: { eventId, deletedAt: null, rsvpStatus: 'PENDING' }
  });

  const nextSteps = buildNextSteps({ setting, byStatus, pendingRsvp });

  return {
    enabled: Boolean(setting?.outreachEnabled),
    autoStart: Boolean(setting?.outreachAutoStart),
    voiceDelayHours: setting?.outreachVoiceDelayHours ?? 24,
    autoCallMode: setting?.outreachAutoCallMode ?? 'ai',
    reminderEnabled: setting?.outreachReminderEnabled !== false,
    counts: {
      idle: byStatus.IDLE || 0,
      awaiting: (byStatus.WHATSAPP_INITIAL_SENT || 0)
        + (byStatus.AWAITING_RSVP || 0)
        + (byStatus.VOICE_SCHEDULED || 0),
      voiceAttempted: byStatus.VOICE_ATTEMPTED || 0,
      reminderSent: byStatus.WHATSAPP_REMINDER_SENT || 0,
      needsPlanner: byStatus.NEEDS_PLANNER || 0,
      complete: byStatus.COMPLETE || 0,
      paused: byStatus.PAUSED || 0
    },
    pendingRsvp,
    nextSteps
  };
};

const buildNextSteps = ({ setting, byStatus, pendingRsvp }) => {
  const steps = [];

  if (!setting?.outreachEnabled) {
    steps.push({
      id: 'enable',
      title: 'Enable WhatsApp-first outreach',
      description: 'Turn on outreach in Event settings, then start sending RSVP links on WhatsApp.',
      action: 'open_event_settings',
      status: 'todo'
    });
    return steps;
  }

  const idle = byStatus.IDLE || 0;
  const paused = byStatus.PAUSED || 0;

  if (idle + paused > 0 && pendingRsvp > 0) {
    steps.push({
      id: 'start_batch',
      title: 'Send WhatsApp invites',
      description: `${idle + paused} guest(s) have not received the initial WhatsApp with RSVP link yet.`,
      action: 'start_outreach_batch',
      status: 'todo'
    });
  }

  const awaiting = (byStatus.WHATSAPP_INITIAL_SENT || 0)
    + (byStatus.AWAITING_RSVP || 0)
    + (byStatus.VOICE_SCHEDULED || 0);

  if (awaiting > 0) {
    steps.push({
      id: 'wait_rsvp',
      title: 'Wait for form RSVPs',
      description: `${awaiting} guest(s) were messaged — auto voice call fires after ${setting?.outreachVoiceDelayHours || 24}h if still pending.`,
      action: 'monitor',
      status: 'in_progress'
    });
  }

  if ((byStatus.VOICE_ATTEMPTED || 0) > 0) {
    steps.push({
      id: 'voice_running',
      title: 'Voice follow-up in progress',
      description: 'Auto calls were placed for guests who did not RSVP via the link.',
      action: 'monitor',
      status: 'in_progress'
    });
  }

  if ((byStatus.NEEDS_PLANNER || 0) > 0) {
    steps.push({
      id: 'manual_follow_up',
      title: 'Manual follow-up needed',
      description: `${byStatus.NEEDS_PLANNER} guest(s) got the WhatsApp reminder after a failed call — review on Follow-up page.`,
      action: 'open_follow_up',
      status: 'todo'
    });
  }

  if (steps.length === 0 && pendingRsvp === 0) {
    steps.push({
      id: 'done',
      title: 'Outreach complete',
      description: 'All guests have responded. No pending RSVP outreach steps.',
      action: 'none',
      status: 'done'
    });
  } else if (steps.every((step) => step.status !== 'todo')) {
    steps.push({
      id: 'monitor',
      title: 'Monitor progress',
      description: 'Automation is running. Check guest outreach badges or Live for updates.',
      action: 'monitor',
      status: 'in_progress'
    });
  }

  return steps;
};

module.exports = {
  sendInitialWhatsApp,
  sendReminderWhatsApp,
  completeOutreach,
  pauseOutreach,
  startOutreachForGuest,
  startOutreachForEvent,
  maybeAutoStartForGuest,
  handleCallOutcomeForOutreach,
  getOutreachSummary,
  buildNextSteps,
  TERMINAL_FAILED_OUTCOMES
};
