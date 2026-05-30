const prisma = require('../config/db');
const env = require('../config/env');
const guestRepository = require('../repositories/guest.repository');
const hotelRepository = require('../repositories/hotel.repository');
const callRepository = require('../repositories/call.repository');
const queueService = require('../queue/queue.service');
const auditService = require('./audit.service');
const callDialerService = require('./call-dialer.service');
const { getPlivoAiWebhookUrl } = require('./plivo.service');
const AppError = require('../utils/AppError');

const formatEventDateSpoken = (date) => {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata'
  }).format(new Date(date));
};

const parseBool = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
};

const assertCallModeConfigured = (callMode) => {
  if (callMode === 'ai') {
    if (!env.plivo.aiAnswerUrl) {
      throw new AppError(
        'AI voice calls are not configured. Set PLIVO_AI_ANSWER_URL to your Plivo Agent Flow invoke URL.',
        503,
        'AI_VOICE_NOT_CONFIGURED'
      );
    }

    return;
  }

  if (!env.plivo.ivrAnswerUrl && !env.plivo.answerUrl) {
    throw new AppError(
      'IVR calls are not configured. Set PLIVO_IVR_ANSWER_URL in the environment.',
      503,
      'IVR_VOICE_NOT_CONFIGURED'
    );
  }
};

const resolveCallMode = (override) => {
  const requested = (override || env.voiceDefaultCallMode || '').toLowerCase();

  if (requested === 'ai' || requested === 'ivr') {
    assertCallModeConfigured(requested);
    return requested;
  }

  if (env.plivo.aiAnswerUrl) {
    return 'ai';
  }

  return 'ivr';
};

const buildAgentContext = async (guest, call) => {
  const event = await prisma.event.findUnique({
    where: { id: guest.eventId },
    include: {
      setting: true,
      creator: {
        select: { email: true }
      }
    }
  });

  if (!event) {
    throw new AppError('Event not found', 404, 'EVENT_NOT_FOUND');
  }

  const hotels = await hotelRepository.findManyByEvent(guest.eventId);
  const transportEnabled = parseBool(env.voiceTransportEnabled, true);
  const hotelEnabled = parseBool(env.voiceHotelEnabled, hotels.length > 0);
  // Spoken on calls — use event title, never email local-part (e.g. choudharyramlal0234).
  const hostLabel = (event.name || '').trim() || 'the hosts';

  return {
    call_id: call?.id || '',
    guest_id: guest.id,
    guest_name: guest.name,
    phone_number: guest.phone,
    from_number: env.plivo.fromNumber,
    event_name: event.name,
    event_date_spoken: formatEventDateSpoken(event.date),
    event_location_spoken: event.location,
    host_label: hostLabel,
    existing_pickup_location: guest.pickupLocation || '',
    transport_enabled: transportEnabled,
    hotel_enabled: hotelEnabled,
    rsvp_webhook_url: getPlivoAiWebhookUrl('ai/rsvp', {
      callId: call?.id || '',
      guestId: guest.id,
      eventId: guest.eventId
    }),
    hangup_webhook_url: getPlivoAiWebhookUrl('ai/hangup', {
      callId: call?.id || '',
      guestId: guest.id,
      eventId: guest.eventId
    }),
    transcript_webhook_url: getPlivoAiWebhookUrl('ai/transcript', {
      callId: call?.id || '',
      guestId: guest.id,
      eventId: guest.eventId
    }),
    error_webhook_url: getPlivoAiWebhookUrl('ai/error', {
      callId: call?.id || '',
      guestId: guest.id,
      eventId: guest.eventId
    })
  };
};

const queueOutboundCall = async ({ guest, user, callMode }) => {
  const call = await callRepository.create({
    eventId: guest.eventId,
    guestId: guest.id,
    phone: guest.phone,
    status: 'QUEUED'
  });

  const agentContext = callMode === 'ai' ? await buildAgentContext(guest, call) : undefined;
  const jobPayload = {
    callId: call.id,
    guestId: guest.id,
    eventId: guest.eventId,
    phone: guest.phone,
    callMode,
    agentContext
  };

  await queueService.addJob('call', jobPayload);

  if (env.queueProvider === 'local') {
    void callDialerService.processCallJob(jobPayload).catch((error) => {
      const logger = require('../utils/logger');
      logger.error(error, { callId: call.id, callMode });
    });
  }

  await auditService.enqueueAuditLog({
    eventId: guest.eventId,
    userId: user.id,
    action: callMode === 'ai' ? 'AI_VOICE_CALL_QUEUED' : 'IVR_CALL_QUEUED',
    entityType: 'Call',
    entityId: call.id,
    metadata: {
      guestId: guest.id,
      status: call.status,
      callMode,
      queuedBy: user.id
    }
  });

  return {
    queued: true,
    callId: call.id,
    callMode
  };
};

const accessService = require('./access.service');

const triggerOutboundCall = async (guestId, user, { callMode: callModeOverride } = {}) => {
  const guest = await guestRepository.findById(guestId);

  if (!guest) {
    throw new AppError('Guest not found', 404, 'GUEST_NOT_FOUND');
  }

  await accessService.assertCanTriggerVoice(user.id, guest.eventId);

  const event = await prisma.event.findUnique({
    where: { id: guest.eventId },
    include: { setting: true }
  });

  if (!event) {
    throw new AppError('Event not found', 404, 'EVENT_NOT_FOUND');
  }

  if (event.setting && event.setting.ivrEnabled === false) {
    throw new AppError('Voice calls are disabled for this event.', 409, 'VOICE_CALLS_DISABLED');
  }

  if (guest.rsvpStatus !== 'PENDING') {
    throw new AppError(
      'Voice calls can only be triggered for guests with pending RSVP.',
      409,
      'VOICE_CALL_NOT_ALLOWED_FOR_RSVP_STATUS'
    );
  }

  const activeCall = await callRepository.findActiveByGuestId(guestId);

  if (activeCall) {
    throw new AppError(
      'A call is already queued or in progress for this guest.',
      409,
      'CALL_IN_PROGRESS'
    );
  }

  const callMode = resolveCallMode(callModeOverride);
  return queueOutboundCall({ guest, user, callMode });
};

/** System-initiated callback (EventBridge) — skips role checks, keeps dial guards. */
const triggerScheduledOutboundCall = async (guestId, user, { callMode: callModeOverride } = {}) => {
  const guest = await guestRepository.findById(guestId);

  if (!guest) {
    throw new AppError('Guest not found', 404, 'GUEST_NOT_FOUND');
  }

  const event = await prisma.event.findUnique({
    where: { id: guest.eventId },
    include: { setting: true }
  });

  if (!event) {
    throw new AppError('Event not found', 404, 'EVENT_NOT_FOUND');
  }

  if (event.setting && event.setting.ivrEnabled === false) {
    throw new AppError('Voice calls are disabled for this event.', 409, 'VOICE_CALLS_DISABLED');
  }

  if (guest.rsvpStatus !== 'PENDING') {
    throw new AppError(
      'Voice calls can only be triggered for guests with pending RSVP.',
      409,
      'VOICE_CALL_NOT_ALLOWED_FOR_RSVP_STATUS'
    );
  }

  const activeCall = await callRepository.findActiveByGuestId(guestId);

  if (activeCall) {
    throw new AppError(
      'A call is already queued or in progress for this guest.',
      409,
      'CALL_IN_PROGRESS'
    );
  }

  const callMode = resolveCallMode(callModeOverride);
  return queueOutboundCall({ guest, user, callMode });
};

const triggerBulkOutboundCalls = async (eventId, user, { callMode: callModeOverride } = {}) => {
  await accessService.assertCanTriggerVoice(user.id, eventId);

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { setting: true }
  });

  if (!event) {
    throw new AppError('Event not found', 404, 'EVENT_NOT_FOUND');
  }

  if (event.setting && event.setting.ivrEnabled === false) {
    throw new AppError('Voice calls are disabled for this event.', 409, 'VOICE_CALLS_DISABLED');
  }

  const callMode = resolveCallMode(callModeOverride);

  const guests = await prisma.guest.findMany({
    where: {
      eventId,
      rsvpStatus: 'PENDING'
    },
    orderBy: { createdAt: 'asc' }
  });

  const summary = {
    totalPending: guests.length,
    queued: 0,
    skipped: 0,
    skippedReasons: {
      callInProgress: 0,
      error: 0
    },
    callIds: []
  };

  for (const guest of guests) {
    const activeCall = await callRepository.findActiveByGuestId(guest.id);

    if (activeCall) {
      summary.skipped += 1;
      summary.skippedReasons.callInProgress += 1;
      continue;
    }

    try {
      const result = await queueOutboundCall({ guest, user, callMode });
      summary.queued += 1;
      summary.callIds.push(result.callId);
    } catch (error) {
      summary.skipped += 1;
      summary.skippedReasons.error += 1;
    }
  }

  await auditService.enqueueAuditLog({
    eventId,
    userId: user.id,
    action: 'BULK_VOICE_CAMPAIGN_QUEUED',
    entityType: 'Event',
    entityId: eventId,
    metadata: {
      callMode,
      ...summary,
      queuedBy: user.id
    }
  });

  const realtimePush = require('./realtime-push.service');
  realtimePush.publishForEventAsync(eventId, {
    type: 'campaign_progress',
    campaign: {
      queued: summary.queued,
      skipped: summary.skipped,
      totalPending: summary.totalPending,
      callMode
    }
  });

  return {
    callMode,
    ...summary
  };
};

module.exports = {
  triggerOutboundCall,
  triggerScheduledOutboundCall,
  triggerBulkOutboundCalls,
  resolveCallMode,
  buildAgentContext
};
